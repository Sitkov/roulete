type Props = {
  gender: string | null;
  desiredGender: 'any' | 'male' | 'female';
  isVip: boolean;
  onChange: (patch: Partial<{ gender: string | null; desiredGender: 'any' | 'male' | 'female' }>) => void;
};

export function Filters({ gender, desiredGender, isVip, onChange }: Props) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-white/70 w-28">Ваш пол</label>
        <select
          className="bg-black/30 rounded px-3 py-2"
          value={gender || ''}
          onChange={(e) => onChange({ gender: e.target.value || null })}
        >
          <option value="">Не важно</option>
          <option value="male">Мужской</option>
          <option value="female">Женский</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-white/70 w-28">Искать</label>
        <select
          className="bg-black/30 rounded px-3 py-2"
          value={desiredGender}
          onChange={(e) => onChange({ desiredGender: e.target.value as any })}
        >
          <option value="any">Любой</option>
          <option value="male">Мужчин</option>
          <option value="female">Женщин</option>
        </select>
      </div>
      <div className="text-xs text-amber-300/90">
        VIP-фильтры доступны премиум пользователям. {isVip ? 'Ваш VIP активен.' : 'Скоро оплата (Stripe/PayPal/YooMoney).'}
      </div>
    </div>
  );
}



