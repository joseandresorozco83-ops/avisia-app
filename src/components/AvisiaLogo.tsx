import React from 'react';

interface AvisiaLogoProps {
  className?: string;
  variant?: 'dark' | 'light';
}

export const AvisiaLogo: React.FC<AvisiaLogoProps> = ({
  className = 'w-8 h-8',
}) => {
  return (
    <img
      src="/avisia-logo.png"
      alt="Logo AVISIA"
      className={`${className} object-contain rounded-full bg-white`}
    />
  );
};
