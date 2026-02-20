"use client";

import React from "react";
import Link from "next/link";
import { hardhat } from "viem/chains";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <div className="sticky top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-md shadow-secondary px-2 sm:px-4">
      <div className="navbar-start w-auto">
        <Link href="/" passHref className="flex items-center gap-2 shrink-0">
          <div className="text-3xl">🦞</div>
          <div className="flex flex-col">
            <span className="font-bold leading-tight">Meme Contest</span>
            <span className="text-xs">by $CLAWD</span>
          </div>
        </Link>
      </div>
      <div className="navbar-end grow mr-2">
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
      </div>
    </div>
  );
};
