"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/lib/config";

export default function CharacterSelect({
  passcodeRequired,
}: {
  passcodeRequired: boolean;
}) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(!passcodeRequired);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handlePasscode = async () => {
    setChecking(true);
    setError("");
    const res = await fetch("/api/health", {
      headers: { "x-passcode": passcode },
    });
    setChecking(false);
    if (res.ok) {
      localStorage.setItem("passcode", passcode);
      setUnlocked(true);
    } else {
      setError("Incorrect passcode.");
    }
  };

  const handleSelect = (characterId: string) => {
    localStorage.setItem("characterId", characterId);
    router.push("/editor");
  };

  if (!unlocked) {
    return (
      <div className="lobby">
        <div className="passcode-gate">
          <h1>Memory Benchmark Portal</h1>
          <p>Enter the passcode to continue.</p>
          <input
            type="password"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePasscode()}
            autoFocus
          />
          <button className="btn-primary" onClick={handlePasscode} disabled={checking || !passcode}>
            {checking ? "Checking…" : "Continue"}
          </button>
          {error && <p className="passcode-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <h1>Memory Benchmark Portal</h1>
      <p>Choose your character to start writing a case.</p>
      <div className="character-grid">
        {config.characters.map((char) => (
          <button
            key={char.id}
            className="character-card"
            onClick={() => handleSelect(char.id)}
          >
            <span className="character-emoji">{char.emoji}</span>
            <span className="character-name">{char.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
