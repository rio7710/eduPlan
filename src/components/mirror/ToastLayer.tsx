type Props = {
  message?: string | null;
};

export function ToastLayer({ message = null }: Props) {
  return <div className={`toast ${message ? 'visible' : ''}`} id="toast">{message ?? ''}</div>;
}
