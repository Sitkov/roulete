type Props = {
  onNext: () => void;
  onStop: () => void;
  onReport: () => void;
  disabled?: boolean;
  showReport?: boolean;
};

export function Controls({ onNext, onStop, onReport, disabled, showReport = true }: Props) {
  return (
    <div className="flex gap-3 flex-wrap">
      <button className="btn w-full sm:w-auto" onClick={onNext} disabled={disabled}>
        Next
      </button>
      <button className="btn bg-white/10 hover:bg-white/20 text-white w-full sm:w-auto" onClick={onStop} disabled={disabled}>
        Stop
      </button>
      {showReport && (
        <button className="btn bg-red-500 hover:bg-red-600 w-full sm:w-auto" onClick={onReport} disabled={disabled}>
          Пожаловаться
        </button>
      )}
    </div>
  );
}


