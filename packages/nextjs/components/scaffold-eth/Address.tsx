"use client";

import { useState } from "react";
import { BlockieAvatar } from "./BlockieAvatar";

type AddressProps = {
  address?: string;
  format?: "short" | "long";
  size?: "xs" | "sm" | "base";
};

const sizes = {
  xs: { text: "text-[10px]", avatar: 14 },
  sm: { text: "text-xs", avatar: 18 },
  base: { text: "text-sm", avatar: 22 },
};

export const Address = ({ address, format = "short", size = "sm" }: AddressProps) => {
  const [copied, setCopied] = useState(false);

  if (!address) return <span className="text-gray-600 font-mono text-xs">—</span>;

  const displayed =
    format === "long" ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;

  const explorerUrl = `https://basescan.org/address/${address}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const s = sizes[size];

  return (
    <div className="inline-flex items-center gap-1.5">
      <BlockieAvatar address={address} size={s.avatar} ensImage={null} />
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${s.text} font-mono text-gray-400 hover:text-white transition-colors`}
      >
        {displayed}
      </a>
      <button
        onClick={handleCopy}
        className="text-gray-600 hover:text-gray-300 transition-colors"
        title="Copy address"
      >
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
          </svg>
        )}
      </button>
    </div>
  );
};
