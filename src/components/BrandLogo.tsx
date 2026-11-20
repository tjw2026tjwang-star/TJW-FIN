import { useState } from 'react';

const TJW_LOGO_URL = 'https://tjwang.com.my/assets/TJW-Logo-50thAnniversary.png';

interface BrandLogoProps {
  compact?: boolean;
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <div className="w-8 h-8 rounded-md bg-[#CB3737] text-white font-display font-bold text-xs flex items-center justify-center shrink-0">
          TJW
        </div>
        <div className="leading-tight">
          <span className="font-display font-bold text-sm tracking-tight text-[#171717] block">
            T.J. Wang
          </span>
          {!compact && (
            <span className="text-[11px] text-neutral-500 block">Finance Department</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
      <img
        src={TJW_LOGO_URL}
        alt="T.J. Wang 50th Anniversary Logo"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={compact ? 'h-9 w-auto object-contain' : 'h-11 w-auto object-contain'}
      />
    </div>
  );
}
