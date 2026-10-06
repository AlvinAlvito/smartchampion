"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
      <input {...props} type={show ? "text" : "password"} className="input px-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-navy-300 hover:bg-navy-50 hover:text-navy-600"
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
