import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import Card from './Card';
import { ChevronRight } from 'lucide-react';

export const PlaceCardPopup = ({ show, card, players, onClose, onPlaceCard, onReplaceJoker }) => {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [step, setStep] = useState('player'); // 'player' or 'meld'

  const handlePlayerSelect = (playerId) => {
    setSelectedPlayer(playerId);
    setStep('meld');
  };

  const handleBack = () => {
    setStep('player');
    setSelectedPlayer(null);
  };

  const handlePlaceInMeld = (meldIndex, position) => {
    onPlaceCard(selectedPlayer, meldIndex, position);
  };

  const handleReplaceJokerInMeld = (meldIndex, jokerIndex, newJokerPosition) => {
    onReplaceJoker(selectedPlayer, meldIndex, jokerIndex, newJokerPosition);
  };

  const selectedPlayerData = players.find(p => p.id === selectedPlayer);

  return (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-white/20 text-white max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Colocar Carta</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {/* Show card to place */}
          <div className="mb-6 text-center">
            <div className="text-sm text-white/60 mb-2">Carta a colocar:</div>
            <div className="flex justify-center">
              <Card card={card} />
            </div>
          </div>

          {step === 'player' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Selecciona un jugador:</h3>
              <div className="space-y-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handlePlayerSelect(player.id)}
                    className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 
                             flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-medium">{player.name}</span>
                      <span className="text-sm text-white/60">
                        ({player.melds?.length || 0} combinaciones)
                      </span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/40" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'meld' && selectedPlayerData && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Combinaciones de {selectedPlayerData.name}
                </h3>
                <Button
                  onClick={handleBack}
                  size="sm"
                  variant="outline"
                  className="border-white/20 hover:bg-white/10 text-white"
                >
                  ← Volver
                </Button>
              </div>

              {selectedPlayerData.melds && selectedPlayerData.melds.length > 0 ? (
                <div className="space-y-6">
                  {selectedPlayerData.melds.map((meld, meldIndex) => (
                    <div key={meldIndex} className="glass-card p-4">
                      <div className="mb-3">
                        <span className="text-sm font-semibold text-white/80">
                          {meld.type === 'set' ? 'Trío' : 'Escalera'} #{meldIndex + 1}
                        </span>
                      </div>

                      {/* Show meld cards */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {meld.cards.map((meldCard, cardIndex) => (
                          <div key={meldCard.id} className="relative">
                            <Card
                              card={meldCard}
                              style={{ width: '70px', height: '98px' }}
                            />
                            {meldCard.is_joker && (
                              <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-xs font-bold 
                                            rounded-full w-6 h-6 flex items-center justify-center">
                                J
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* For runs, show gaps for start/end placement */}
                      {meld.type === 'run' && (
                        <div className="mb-3">
                          <div className="text-xs text-white/60 mb-2">
                            Colocar en extremos de la escalera:
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handlePlaceInMeld(meldIndex, 0)}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Al principio
                            </Button>
                            <Button
                              onClick={() => handlePlaceInMeld(meldIndex, meld.cards.length)}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Al final
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* For sets, just one placement option */}
                      {meld.type === 'set' && (
                        <div className="mb-3">
                          <Button
                            onClick={() => handlePlaceInMeld(meldIndex, null)}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                          >
                            Agregar al trío
                          </Button>
                        </div>
                      )}

                      {/* Joker replacement options */}
                      {meld.cards.some(c => c.is_joker) && !card.is_joker && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="text-sm font-semibold text-yellow-400 mb-2">
                            Reemplazar Joker:
                          </div>
                          {meld.cards.map((meldCard, jokerIndex) => {
                            if (!meldCard.is_joker) return null;
                            
                            return (
                              <div key={meldCard.id} className="mb-3">
                                <div className="text-xs text-white/60 mb-2">
                                  Reemplazar Joker en posición {jokerIndex + 1}:
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  {meld.type === 'run' && (
                                    <>
                                      <Button
                                        onClick={() => handleReplaceJokerInMeld(meldIndex, jokerIndex, 0)}
                                        size="sm"
                                        className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs"
                                      >
                                        Joker al inicio
                                      </Button>
                                      <Button
                                        onClick={() => handleReplaceJokerInMeld(meldIndex, jokerIndex, meld.cards.length)}
                                        size="sm"
                                        className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs"
                                      >
                                        Joker al final
                                      </Button>
                                    </>
                                  )}
                                  {meld.type === 'set' && (
                                    <Button
                                      onClick={() => handleReplaceJokerInMeld(meldIndex, jokerIndex, meld.cards.length)}
                                      size="sm"
                                      className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs"
                                    >
                                      Reemplazar y mantener Joker en trío
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/60 py-8">
                  Este jugador no tiene combinaciones bajadas.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-white/10">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-white/20 hover:bg-white/10 text-white"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlaceCardPopup;