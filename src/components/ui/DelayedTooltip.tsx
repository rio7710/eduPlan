import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Props = {
  content: string;
  delay?: number;
  children: ReactElement;
};

type Position = {
  top: number;
  left: number;
};

type TooltipChildProps = {
  'aria-describedby'?: string;
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseMove?: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
};

export function DelayedTooltip({ content, delay = 500, children }: Props) {
  const child = Children.only(children) as ReactElement<TooltipChildProps>;
  const id = useId();
  const timerRef = useRef<number | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef<Position | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const updatePosition = () => {
    if (pointerRef.current) {
      setPosition({
        top: pointerRef.current.top,
        left: pointerRef.current.left,
      });
      return;
    }
    if (!anchorRef.current) {
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.top - 10,
      left: rect.left + rect.width / 2,
    });
  };

  const showTooltip = () => {
    updatePosition();
    setVisible(true);
  };

  const scheduleTooltip = () => {
    clearTimer();
    timerRef.current = window.setTimeout(showTooltip, delay);
  };

  const hideTooltip = () => {
    clearTimer();
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) {
      return;
    }
    const handleWindowChange = () => updatePosition();
    window.addEventListener('scroll', handleWindowChange, true);
    window.addEventListener('resize', handleWindowChange);
    return () => {
      window.removeEventListener('scroll', handleWindowChange, true);
      window.removeEventListener('resize', handleWindowChange);
    };
  }, [visible]);

  useEffect(() => () => clearTimer(), []);

  if (!isValidElement(child)) {
    return child as ReactNode;
  }

  const childProps = child.props;

  return (
    <>
      {cloneElement(child, {
        'aria-describedby': visible ? id : undefined,
        onMouseEnter: (event: MouseEvent<HTMLElement>) => {
          childProps.onMouseEnter?.(event);
          anchorRef.current = event.currentTarget;
          pointerRef.current = { top: event.clientY, left: event.clientX };
          scheduleTooltip();
        },
        onMouseMove: (event: MouseEvent<HTMLElement>) => {
          anchorRef.current = event.currentTarget;
          pointerRef.current = { top: event.clientY, left: event.clientX };
          if (visible) {
            updatePosition();
          }
        },
        onMouseLeave: (event: MouseEvent<HTMLElement>) => {
          childProps.onMouseLeave?.(event);
          pointerRef.current = null;
          hideTooltip();
        },
        onFocus: (event: FocusEvent<HTMLElement>) => {
          childProps.onFocus?.(event);
          anchorRef.current = event.currentTarget;
          pointerRef.current = null;
          scheduleTooltip();
        },
        onBlur: (event: FocusEvent<HTMLElement>) => {
          childProps.onBlur?.(event);
          pointerRef.current = null;
          hideTooltip();
        },
      })}
      {visible && position
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              className="delayed-tooltip"
              style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
