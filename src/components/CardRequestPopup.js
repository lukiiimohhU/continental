import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

export const CardRequestPopup = ({ requesterName, card, onAccept, onDecline, show }) => {
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    if (!show) {
      setTimeLeft(10);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [show]);

  useEffect(() => {
    if (timeLeft === 0 && show) {
      onDecline();
    }
  }, [timeLeft, show, onDecline]);

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="bg-zinc-900 border-white/20 text-white card-request-popup">
        <DialogHeader>
          <DialogTitle className="text-2xl">Solicitud de Carta</DialogTitle>
          <DialogDescription className="text-white/70">
            {requesterName} quiere robar esta carta del descarte
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-4 py-4">
          <div className="relative">
            <Card card={card} />
            
            {/* Timer circle */}
            <div className="absolute -top-4 -right-4 w-16 h-16 flex items-center justify-center">
              <svg className="transform -rotate-90 w-16 h-16">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="4"
                  fill="none"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="#ffffff"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray="176"
                  strokeDashoffset={176 * (1 - timeLeft / 10)}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute text-2xl font-bold">{timeLeft}</div>
            </div>
          </div>

          <div className="flex gap-4 w-full">
            <Button
              onClick={onAccept}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              Sí, la quiero
            </Button>
            <Button
              onClick={onDecline}
              variant="outline"
              className="flex-1 border-white/20 hover:bg-white/10 text-white"
            >
              No, gracias
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CardRequestPopup;
