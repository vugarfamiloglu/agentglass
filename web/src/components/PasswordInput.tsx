import { useState } from "react";

interface PasswordInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function PasswordInput({ value, onChange, placeholder }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-input">
      <input
        className="input mono"
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="pw-eye mono"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? "hide" : "show"}
      </button>
    </div>
  );
}
