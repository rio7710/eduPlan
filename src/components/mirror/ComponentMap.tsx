import { componentMapData } from './componentMapData';

export function ComponentMap() {
  return (
    <div style={{ display: 'none' }} data-component-map={JSON.stringify(componentMapData)} />
  );
}
