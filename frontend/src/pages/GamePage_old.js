import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowDown, Users } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const WS_URL = BACKEND_URL.replace('https', 'wss').replace('http', 'ws');

export default function GamePage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const wsRef = useRef(null);
  const playerId = localStorage.getItem('player_id');

  useEffect(() => {
    if (!playerId) {
      navigate('/');
      return;
    }

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomCode]);

  const connectWebSocket = () => {
    const ws = new WebSocket(`${WS_URL}/api/ws/${roomCode}/${playerId}`);
    
    ws.onopen = () => {
      console.log('Game WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'game_state') {
        setGameState(data);
      } else if (data.type === 'error') {
        toast.error(data.message);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    wsRef.current = ws;
  };

  const sendAction = (action, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...data }));
    }
  };

  const drawCard = (fromPile) => {
    if (!isMyTurn() || gameState?.turn_phase !== 'draw' || gameState?.has_drawn) {
      toast.error('Cannot draw card right now');
      return;
    }
    sendAction('draw_card', { from_pile: fromPile });
  };

  const discardCard = (cardId) => {
    if (!isMyTurn() || gameState?.turn_phase !== 'discard') {
      toast.error('Cannot discard card right now');
      return;
    }
    sendAction('discard_card', { card_id: cardId });
    setSelectedCards([]);
  };

  const toggleCardSelection = (cardId) => {
    setSelectedCards(prev => {
      if (prev.includes(cardId)) {
        return prev.filter(id => id !== cardId);
      } else {
        return [...prev, cardId];
      }
    });
  };

  const meldCards = (meldType) => {
    if (selectedCards.length < 3) {
      toast.error('Select at least 3 cards to meld');
      return;
    }
    sendAction('meld_cards', { cards: selectedCards, meld_type: meldType });
    setSelectedCards([]);
  };

  const isMyTurn = () => {
    return gameState?.current_player_id === playerId;
  };

  const getCardColor = (card) => {
    if (card.suit === 'JOKER') return 'card-joker';
    return (card.suit === '♥' || card.suit === '♦') ? 'card-red' : 'card-black';
  };

  const getRoundRequirement = (round) => {
    const requirements = {
      1: 'Two sets of 3',
      2: 'One set of 3 + one run of 4',
      3: 'Two runs of 4',
      4: 'Three sets of 3',
      5: 'Two sets of 3 + one run of 5',
      6: 'One set of 3 + one run of 7',
      7: 'Three runs of 4'
    };
    return requirements[round] || '';
  };

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-2xl">Loading game...</div>
      </div>
    );
  }

  if (gameState.game_over) {
    const sortedPlayers = [...gameState.players].sort((a, b) => a.score - b.score);
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="glass-card border-white/20 max-w-2xl w-full" data-testid="game-over-card">
          <CardContent className="p-8">
            <h1 className="text-4xl font-bold text-white mb-6 text-center">Game Over!</h1>
            <div className="space-y-4">
              {sortedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between bg-white/5 p-4 rounded-lg"
                  data-testid={`final-score-${player.id}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-white">{index + 1}.</span>
                    <span className="text-xl text-white">{player.name}</span>
                  </div>
                  <span className="text-2xl font-bold text-white">{player.score} pts</span>
                </div>
              ))}
            </div>
            <Button
              onClick={() => navigate('/')}
              className="w-full mt-6 bg-white text-purple-700 hover:bg-white/90 font-semibold"
              data-testid="return-home-button"
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const myPlayer = gameState.players.find(p => p.id === playerId);
  const otherPlayers = gameState.players.filter(p => p.id !== playerId);

  return (
    <div className="min-h-screen p-4" data-testid="game-page">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="glass-card p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white" data-testid="round-info">
                Round {gameState.round}/7
              </h2>
              <p className="text-white/70 text-sm">{getRoundRequirement(gameState.round)}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-white/70">Your Score</div>
              <div className="text-3xl font-bold text-white" data-testid="my-score">{myPlayer?.score || 0}</div>
            </div>
          </div>
        </div>

        {/* Other Players */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {otherPlayers.map((player) => (
            <div
              key={player.id}
              className={`glass-card p-4 ${player.id === gameState.current_player_id ? 'ring-2 ring-yellow-400' : ''}`}
              data-testid={`other-player-${player.id}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-white" />
                <span className="text-white font-medium text-sm">{player.name}</span>
              </div>
              <div className="text-xs text-white/70 mb-2">
                Cards: {player.hand_count} | Score: {player.score}
              </div>
              {player.melds && player.melds.length > 0 && (
                <div className="space-y-2">
                  {player.melds.map((meld, idx) => (
                    <div key={idx} className="flex flex-wrap gap-1">
                      {meld.cards.map((card) => (
                        <div
                          key={card.id}
                          className={`card-element scale-50 origin-top-left ${getCardColor(card)}`}
                          style={{ width: '40px', height: '56px', fontSize: '0.75rem' }}
                        >
                          <span>{card.rank}</span>
                          <span>{card.suit}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Game Table */}
        <div className="game-table mb-6" data-testid="game-table">
          <div className="flex items-center justify-center gap-8 mb-4">
            {/* Deck */}
            <div className="text-center">
              <div
                onClick={() => drawCard('deck')}
                className="card-element bg-blue-600 text-white cursor-pointer hover:bg-blue-700"
                data-testid="draw-deck-button"
              >
                <div className="text-sm">Draw</div>
                <div className="text-2xl font-bold">{gameState.deck_count}</div>
              </div>
              <div className="text-white/70 text-sm mt-2">Deck</div>
            </div>

            {/* Discard Pile */}
            <div className="text-center">
              {gameState.discard_pile_top ? (
                <div
                  onClick={() => drawCard('discard')}
                  className={`card-element ${getCardColor(gameState.discard_pile_top)} cursor-pointer`}
                  data-testid="draw-discard-button"
                >
                  <span className="card-rank">{gameState.discard_pile_top.rank}</span>
                  <span className="card-suit">{gameState.discard_pile_top.suit}</span>
                  <span className="card-rank-bottom">{gameState.discard_pile_top.rank}</span>
                </div>
              ) : (
                <div className="card-element bg-gray-300">
                  <div className="text-sm text-gray-600">Empty</div>
                </div>
              )}
              <div className="text-white/70 text-sm mt-2">Discard</div>
            </div>
          </div>

          {/* Turn Indicator */}
          {isMyTurn() && (
            <div className="text-center mb-4">
              <div className="inline-flex items-center gap-2 bg-yellow-400 text-purple-900 px-4 py-2 rounded-full font-semibold player-indicator" data-testid="your-turn-indicator">
                <span>YOUR TURN</span>
                {gameState.turn_phase === 'draw' && !gameState.has_drawn && <span>- Draw a card</span>}
                {gameState.turn_phase === 'discard' && <span>- Discard a card</span>}
              </div>
            </div>
          )}
        </div>

        {/* My Hand */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Your Hand</h3>
            <div className="flex gap-2">
              {selectedCards.length >= 3 && (
                <>
                  <Button
                    onClick={() => meldCards('set')}
                    size="sm"
                    className="bg-emerald-500 hover:bg-emerald-600"
                    data-testid="meld-set-button"
                  >
                    Meld Set
                  </Button>
                  <Button
                    onClick={() => meldCards('run')}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600"
                    data-testid="meld-run-button"
                  >
                    Meld Run
                  </Button>
                </>
              )}
              {selectedCards.length === 1 && gameState.turn_phase === 'discard' && (
                <Button
                  onClick={() => discardCard(selectedCards[0])}
                  size="sm"
                  className="bg-red-500 hover:bg-red-600"
                  data-testid="discard-selected-button"
                >
                  Discard <ArrowDown className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3" data-testid="my-hand">
            {gameState.my_hand && gameState.my_hand.map((card) => (
              <div
                key={card.id}
                onClick={() => toggleCardSelection(card.id)}
                className={`card-element ${getCardColor(card)} ${selectedCards.includes(card.id) ? 'selected' : ''}`}
                data-testid={`card-${card.id}`}
              >
                <span className="card-rank">{card.rank}</span>
                <span className="card-suit">{card.suit}</span>
                <span className="card-rank-bottom">{card.rank}</span>
              </div>
            ))}
          </div>

          {/* My Melds */}
          {myPlayer?.melds && myPlayer.melds.length > 0 && (
            <div className="mt-6">
              <h4 className="text-lg font-semibold text-white mb-3">Your Melds</h4>
              <div className="space-y-3">
                {myPlayer.melds.map((meld, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 bg-white/5 p-3 rounded-lg" data-testid={`my-meld-${idx}`}>
                    {meld.cards.map((card) => (
                      <div
                        key={card.id}
                        className={`card-element ${getCardColor(card)}`}
                        style={{ width: '60px', height: '84px', fontSize: '1rem' }}
                      >
                        <span className="card-rank" style={{ fontSize: '0.9rem' }}>{card.rank}</span>
                        <span className="card-suit" style={{ fontSize: '1.5rem' }}>{card.suit}</span>
                        <span className="card-rank-bottom" style={{ fontSize: '0.9rem' }}>{card.rank}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}