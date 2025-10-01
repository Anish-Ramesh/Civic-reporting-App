import React from "react";

// Minimal, professional loader with subtle animation and refined overlay
const SpinnerModal = ({ visible, label = "Loading..." }) => {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <div className="absolute inset-0 backdrop-blur-sm bg-white/60" />
      <div className="relative flex flex-col items-center gap-4 rounded-2xl bg-white/90 px-8 py-8 ring-1 ring-gray-200 shadow-xl">
        <div className="h-10 w-10">
          <span className="block h-full w-full animate-[spin_1.2s_linear_infinite] rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
      </div>
    </div>
  );
};

export default SpinnerModal;
