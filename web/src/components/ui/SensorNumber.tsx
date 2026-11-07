/** Fixed-width tabular slot: a changed reading fades in without moving its unit. */
export function SensorNumber({ value }: { value: string }) {
  return (
    <span className="sensor-number">
      <span aria-hidden="true">88888</span>
      <span key={value} data-current>
        {value}
      </span>
    </span>
  );
}
