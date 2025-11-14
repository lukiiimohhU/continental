import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trophy, ArrowRight } from 'lucide-react';

export const RoundEndScreen = ({ 
  roundNumber, 
  winnerName, 
  players, 
  onContinue, 
  isHost,
  nextRound 
}) => {
  // Sort players by score (lowest first)
  const sortedPlayers = [...players].sort((a, b) => a.score - b.score);

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="my-auto">
        <Card className="glass-card border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Trophy className="h-12 w-12 text-yellow-400" />
              <CardTitle className="text-4xl text-white">
                ¡Ronda {roundNumber} Completada!
              </CardTitle>
            </div>
            <p className="text-xl text-white/80">
              {winnerName} ganó la ronda
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Scores Table */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 text-center">
                Puntuaciones Actuales
              </h3>
              <div className="space-y-2">
                {sortedPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                      index === 0
                        ? 'bg-yellow-600/20 border-2 border-yellow-600'
                        : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-white/60 w-8">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-white">
                            {player.name}
                          </span>
                          {index === 0 && (
                            <Trophy className="h-5 w-5 text-yellow-400" />
                          )}
                        </div>
                        {player.warnings > 0 && (
                          <span className="text-sm text-yellow-400">
                            {player.warnings} advertencia(s)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-white">
                      {player.score} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Next Round Info */}
            {nextRound <= 7 && (
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-semibold mb-1">
                      Próxima Ronda: {nextRound}
                    </h4>
                    <p className="text-white/60 text-sm">
                      {getRoundObjective(nextRound)}
                    </p>
                  </div>
                  <ArrowRight className="h-8 w-8 text-white/40" />
                </div>
              </div>
            )}

            {/* Continue Button (only for host) */}
            {isHost ? (
              <Button
                onClick={onContinue}
                className="w-full bg-white text-black hover:bg-white/90 font-semibold py-6 text-lg"
              >
                {nextRound <= 7 ? 'Iniciar Siguiente Ronda' : 'Ver Resultados Finales'}
              </Button>
            ) : (
              <div className="text-center text-white/60 py-4">
                Esperando que el anfitrión inicie la siguiente ronda...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function getRoundObjective(round) {
  const objectives = {
    1: '2 Tríos de 3 cartas',
    2: '1 Trío + 1 Escalera de 4',
    3: '2 Escaleras de 4',
    4: '3 Tríos',
    5: '2 Tríos + 1 Escalera',
    6: '1 Trío + 2 Escaleras',
    7: 'Bajar todas las cartas en un turno'
  };
  return objectives[round] || '';
}

export default RoundEndScreen;