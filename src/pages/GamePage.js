import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card as UICard, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowDown, Users, AlertCircle, Timer, Plus, ChevronDown } from 'lucide-react';
import Card from '@/components/Card';
import FanCards from '@/components/FanCards';
import PlaceCardPopup from '@/components/PlaceCardPopup';
import RoundEndScreen from '@/pages/RoundEndScreen';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const WS_URL = BACKEND_URL.replace('https', 'wss').replace('http', 'ws');

export default function GamePage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedMelds, setSelectedMelds] = useState([]);
  const [waitTimeLeft, setWaitTimeLeft] = useState(0);
  const [draggedCard, setDraggedCard] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [showPlaceCardPopup, setShowPlaceCardPopup] = useState(false);
  const [cardToPlace, setCardToPlace] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [touchStartTime, setTouchStartTime] = useState(null);
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const [touchDragActive, setTouchDragActive] = useState(false);
  const [touchStartPos, setTouchStartPos] = useState(null);
  const longPressTimerRef = useRef(null);
  const resetTimerRef = useRef(null);
  const isDraggingRef = useRef(false); // Ref for synchronous drag state
  const draggedCardRef = useRef(null); // Ref to persist through re-renders
  const wsRef = useRef(null);
  const playerId = localStorage.getItem('player_id');

  // Mobile UI states
  const [showOtherPlayers, setShowOtherPlayers] = useState(false);
  const [showMyMelds, setShowMyMelds] = useState(false);

  // Define callbacks before useEffect that uses them
  const loadRoomData = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/room/${roomCode}`);
      const data = await response.json();
      setRoomData(data);
    } catch (error) {
      console.error('Error loading room:', error);
    }
  }, [roomCode]);

  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/api/ws/${roomCode}/${playerId}`);

    ws.onopen = () => {
      console.log('Game WebSocket conectado');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'game_state') {
        setGameState(data);
      } else if (data.type === 'error') {
        toast.error(data.message);
      } else if (data.type === 'notification') {
        toast.info(data.message);
      } else if (data.type === 'round_ended') {
        toast.success(data.message);
      } else if (data.type === 'game_started') {
        toast.success(data.message);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket desconectado');
    };

    wsRef.current = ws;
  }, [roomCode, playerId]);

  useEffect(() => {
    if (!playerId) {
      navigate('/');
      return;
    }

    loadRoomData();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomCode, playerId, navigate, loadRoomData, connectWebSocket]);

  // Timer for 5-second wait period
  useEffect(() => {
    if (gameState?.waiting_for_requests && gameState?.wait_end_time) {
      const updateTimer = () => {
        const now = Date.now() / 1000;
        const timeLeft = Math.max(0, Math.ceil(gameState.wait_end_time - now));
        setWaitTimeLeft(timeLeft);
      };

      updateTimer();
      const interval = setInterval(updateTimer, 100);

      return () => clearInterval(interval);
    } else {
      setWaitTimeLeft(0);
    }
  }, [gameState?.waiting_for_requests, gameState?.wait_end_time]);

  // Handle visibility change (mobile app switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('App became visible - checking WebSocket connection');

        // Check if WebSocket is disconnected or closing
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('WebSocket disconnected, reconnecting...');

          // Close old connection if it exists
          if (wsRef.current) {
            wsRef.current.close();
          }

          // Reconnect WebSocket
          connectWebSocket();

          // Reload room data to sync state
          loadRoomData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connectWebSocket, loadRoomData]);

  const sendAction = (action, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...data }));
    }
  };

  const continueToNextRound = () => {
    sendAction('continue_to_next_round');
  };

  const drawCard = (fromPile) => {
    if (!isMyTurn()) {
      toast.error('No es tu turno');
      return;
    }
    if (gameState?.turn_phase !== 'draw') {
      toast.error('Ya has robado una carta');
      return;
    }
    if (gameState?.has_drawn) {
      toast.error('Ya has robado una carta');
      return;
    }
    sendAction('draw_card', { from_pile: fromPile });
  };

  const requestDiscardCard = () => {
    // Can request during wait period OR during first draw
    const canRequest = gameState?.waiting_for_requests || gameState?.first_draw_of_round;
    
    if (!canRequest) {
      toast.error('No hay período de espera activo');
      return;
    }
    
    if (!gameState?.discard_pile_top) {
      toast.error('No hay carta en el descarte');
      return;
    }
    
    sendAction('request_discard_card');
    toast.success('Solicitud enviada');
  };

  const discardCard = (cardId) => {
    if (!isMyTurn()) {
      toast.error('No es tu turno');
      return;
    }
    if (!gameState?.has_drawn) {
      toast.error('Debes robar una carta primero');
      return;
    }
    sendAction('discard_card', { card_id: cardId });
    setSelectedCards([]);
  };

  const toggleCardSelection = (cardId, bypassGuard = false) => {
    // Don't toggle if we just finished a touch drag (unless bypassed)
    if (!bypassGuard && (touchDragActive || longPressTriggered)) {
      return;
    }

    setSelectedCards(prev => {
      const newSelection = prev.includes(cardId)
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId];
      return newSelection;
    });
  };

  const createMeld = (type) => {
    if (!selectedMelds.length && !selectedCards.length) {
      toast.error('Selecciona cartas para formar una combinación');
      return;
    }
    
    if (selectedCards.length > 0) {
      setSelectedMelds([...selectedMelds, { type, card_ids: selectedCards }]);
      setSelectedCards([]);
      toast.success(`${type === 'set' ? 'Trío' : 'Escalera'} agregado. Añade más o presiona "Bajar Cartas"`);
    }
  };

  const layDownMelds = () => {
    if (!isMyTurn()) {
      toast.error('No es tu turno');
      return;
    }
    
    if (!gameState?.has_drawn) {
      toast.error('Debes robar antes de bajar');
      return;
    }

    if (selectedMelds.length === 0 && selectedCards.length > 0) {
      toast.error('Primero crea combinaciones con las cartas seleccionadas');
      return;
    }

    if (selectedMelds.length === 0) {
      toast.error('No has creado ninguna combinación');
      return;
    }

    sendAction('lay_down_melds', { melds: selectedMelds });
    setSelectedMelds([]);
    setSelectedCards([]);
  };

  const clearMelds = () => {
    setSelectedMelds([]);
    setSelectedCards([]);
    toast.info('Combinaciones canceladas');
  };

  const openPlaceCardPopup = () => {
    if (selectedCards.length !== 1) {
      toast.error('Selecciona exactamente una carta para colocar');
      return;
    }
    
    if (!gameState?.has_drawn) {
      toast.error('Debes robar primero');
      return;
    }
    
    if (!gameState?.has_laid_down) {
      toast.error('Debes bajar tus combinaciones primero');
      return;
    }
    
    const card = gameState.my_hand.find(c => c.id === selectedCards[0]);
    setCardToPlace(card);
    setShowPlaceCardPopup(true);
  };

  const handlePlaceCard = (targetPlayerId, meldIndex, position) => {
    if (!cardToPlace) return;
    
    sendAction('lay_off_card', {
      card_id: cardToPlace.id,
      target_player_id: targetPlayerId,
      meld_index: meldIndex,
      position: position
    });
    
    setShowPlaceCardPopup(false);
    setCardToPlace(null);
    setSelectedCards([]);
  };

  const handleReplaceJoker = (targetPlayerId, meldIndex, jokerIndex, newJokerPosition) => {
    if (!cardToPlace) return;
    
    sendAction('replace_joker', {
      card_id: cardToPlace.id,
      target_player_id: targetPlayerId,
      meld_index: meldIndex,
      joker_index: jokerIndex,
      new_joker_position: newJokerPosition
    });
    
    setShowPlaceCardPopup(false);
    setCardToPlace(null);
    setSelectedCards([]);
  };

  const reorderHand = useCallback((cardOrder) => {
    sendAction('reorder_hand', { card_order: cardOrder });
  }, []);

  const handleDragStart = (e, card, index) => {
    setDraggedCard({ card, index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    if (!draggedCard || draggedCard.index === dropIndex) {
      return;
    }

    const newHand = [...gameState.my_hand];
    const [movedCard] = newHand.splice(draggedCard.index, 1);
    newHand.splice(dropIndex, 0, movedCard);
    
    const cardOrder = newHand.map(c => c.id);
    reorderHand(cardOrder);
    
    setDraggedCard(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverIndex(null);
  };

  // Touch handlers for mobile drag & drop
  const handleTouchStart = (e, card, index) => {
    // Prevent text selection and context menu
    e.preventDefault();

    // Clear any existing timers (important!)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    // Save initial touch position
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });

    // Reset states immediately when starting a new touch
    setTouchStartTime(Date.now());
    setLongPressTriggered(false);
    setTouchDragActive(false);
    setDraggedCard(null);
    setDragOverIndex(null);
    isDraggingRef.current = false;
    draggedCardRef.current = null;

    // Start long press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      // Clear the timer reference immediately
      longPressTimerRef.current = null;

      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Activate drag mode - use refs for immediate effect
      const cardData = { card, index };
      isDraggingRef.current = true;
      draggedCardRef.current = cardData;
      setLongPressTriggered(true);
      setTouchDragActive(true);
      setDraggedCard(cardData);
    }, 500);
  };

  const handleTouchMove = (e, currentIndex) => {
    // Check ref first for immediate response
    if (isDraggingRef.current) {
      // Prevent scrolling while dragging
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);

      // Find the card-slot element
      const cardSlot = elementAtPoint?.closest('.card-slot');
      if (cardSlot) {
        const allSlots = Array.from(document.querySelectorAll('.card-slot'));
        const dropIndex = allSlots.indexOf(cardSlot);

        if (dropIndex !== -1 && dropIndex !== currentIndex) {
          setDragOverIndex(dropIndex);
        }
      }
      return;
    }

    // If long press not triggered yet, check if movement exceeds threshold
    if (longPressTimerRef.current && touchStartPos) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPos.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.y);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Only cancel if user moved more than 15 pixels
      if (distance > 15) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleTouchEnd = (e, currentIndex) => {
    const wasDragging = isDraggingRef.current;

    // ALWAYS prevent default to avoid onClick from firing after we handle the touch manually
    e.preventDefault();
    e.stopPropagation();

    // Clear long press timer if it's still running
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Clear any pending reset timer
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    // If we were dragging, handle the drop
    if (wasDragging && draggedCardRef.current) {
      const dropIndex = dragOverIndex !== null ? dragOverIndex : currentIndex;
      const draggedCardData = draggedCardRef.current;
      const actuallyMoved = draggedCardData.index !== dropIndex;

      // Only reorder if the card was moved to a different position
      if (actuallyMoved) {
        const newHand = [...gameState.my_hand];
        const [movedCard] = newHand.splice(draggedCardData.index, 1);
        newHand.splice(dropIndex, 0, movedCard);

        const cardOrder = newHand.map(c => c.id);
        reorderHand(cardOrder);
      }

      // Reset refs immediately
      isDraggingRef.current = false;
      draggedCardRef.current = null;

      // Only use timeout if we actually moved the card, otherwise reset immediately
      if (actuallyMoved) {
        // Keep the drag states active very briefly to prevent onClick from firing
        resetTimerRef.current = setTimeout(() => {
          setTouchStartTime(null);
          setTouchStartPos(null);
          setLongPressTriggered(false);
          setTouchDragActive(false);
          setDraggedCard(null);
          setDragOverIndex(null);
          resetTimerRef.current = null;
        }, 50);
      } else {
        // Reset immediately if card wasn't moved
        setTouchStartTime(null);
        setTouchStartPos(null);
        setLongPressTriggered(false);
        setTouchDragActive(false);
        setDraggedCard(null);
        setDragOverIndex(null);
      }
    } else {
      // User just tapped (no long press) - handle card selection here
      isDraggingRef.current = false;
      draggedCardRef.current = null;
      setTouchStartTime(null);
      setTouchStartPos(null);
      setLongPressTriggered(false);
      setTouchDragActive(false);
      setDraggedCard(null);
      setDragOverIndex(null);

      // Since preventDefault blocks onClick, manually trigger selection for quick taps
      // Use bypassGuard=true to avoid race condition with async state updates
      const card = gameState.my_hand[currentIndex];
      if (card) {
        toggleCardSelection(card.id, true);
      }
    }
  };

  const handleTouchCancel = (e) => {
    // Prevent default behavior
    e?.preventDefault();

    // Clear timers and reset states if touch is cancelled
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    isDraggingRef.current = false;
    draggedCardRef.current = null;
    setTouchStartTime(null);
    setTouchStartPos(null);
    setLongPressTriggered(false);
    setTouchDragActive(false);
    setDraggedCard(null);
    setDragOverIndex(null);
  };

  // Restore visual states from refs after re-renders (e.g., from WebSocket updates)
  useEffect(() => {
    // If refs indicate we're dragging but states are lost, restore them
    if (isDraggingRef.current) {
      if (!touchDragActive) {
        setTouchDragActive(true);
      }
      if (!longPressTriggered) {
        setLongPressTriggered(true);
      }
      if (draggedCardRef.current && !draggedCard) {
        setDraggedCard(draggedCardRef.current);
      }
    }
  }, [gameState, touchDragActive, longPressTriggered, draggedCard]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const isMyTurn = () => {
    return gameState?.current_player_id === playerId;
  };

  const myPlayer = gameState?.players.find(p => p.id === playerId);

  // Check if anyone has laid down (for showing place button)
  const anyoneHasLaidDown = gameState?.players.some(p => p.has_laid_down) || false;
  const canPlaceCards = gameState?.has_laid_down && anyoneHasLaidDown && isMyTurn() && gameState?.has_drawn;

  // Check if can request card (during wait OR first draw)
  const canRequestCard = (gameState?.waiting_for_requests || gameState?.first_draw_of_round) && 
                         gameState?.discard_pile_top && 
                         !isMyTurn();

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-2xl">Cargando juego...</div>
      </div>
    );
  }

  // Show round end screen
  if (gameState?.round_ended && !gameState?.game_over) {
    return (
      <RoundEndScreen
        roundNumber={gameState.round}
        winnerName={gameState.round_winner_name}
        players={gameState.players}
        isHost={roomData?.host_id === playerId}
        nextRound={gameState.round + 1}
        onContinue={continueToNextRound}
      />
    );
  }

  if (gameState.game_over) {
    const sortedPlayers = [...gameState.players].sort((a, b) => a.score - b.score);
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-black">
        <div className="max-w-2xl w-full glass-card p-8">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">¡Juego Terminado!</h1>
          
          <div className="space-y-4 mb-8">
            {sortedPlayers.map((player, index) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-4 rounded-lg ${
                  index === 0 ? 'bg-yellow-600/20 border-2 border-yellow-600' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-white/60">#{index + 1}</span>
                  <span className="text-xl font-semibold text-white">{player.name}</span>
                  {index === 0 && <span className="text-2xl">🏆</span>}
                </div>
                <span className="text-xl font-bold text-white">{player.score} pts</span>
              </div>
            ))}
          </div>

          <Button
            onClick={() => navigate('/')}
            className="w-full bg-white text-black hover:bg-white/90 font-semibold py-6 text-lg"
          >
            Volver al Inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-2 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header - Compact on mobile */}
        <div className="glass-card p-2 md:p-4 mb-3 md:mb-6" data-testid="game-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg md:text-2xl font-bold">Continental - R{gameState.round}</h1>
              <div className="text-xs md:text-sm text-white/60 mt-1">
                <code className="text-white">{roomCode}</code>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs md:text-sm text-white/60">Objetivo:</div>
              <div className="text-white text-xs md:text-base font-semibold">
                {gameState.round_requirements.sets.length > 0 && (
                  <span>{gameState.round_requirements.sets.length} Trío(s) </span>
                )}
                {gameState.round_requirements.runs.length > 0 && (
                  <span>{gameState.round_requirements.runs.length} Escalera(s)</span>
                )}
                {gameState.round === 7 && <span>3 Escaleras + Bajar todo en un turno</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Other Players - Collapsible on mobile */}
        <div className="mb-3 md:mb-6">
          <div
            className="md:hidden mobile-section-header"
            onClick={() => setShowOtherPlayers(!showOtherPlayers)}
          >
            <span className="mobile-section-title">
              Jugadores ({gameState.players.filter(p => p.id !== playerId).length})
            </span>
            <ChevronDown className={`h-4 w-4 section-toggle-icon ${showOtherPlayers ? 'rotated' : ''}`} />
          </div>
          <div className={`mobile-section-content ${showOtherPlayers ? 'expanded' : ''} md:!max-h-none`}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
          {gameState.players.filter(p => p.id !== playerId).map((player) => (
            <div
              key={player.id}
              className={`glass-card p-2 md:p-4 player-card-mobile ${
                player.id === gameState.current_player_id ? 'ring-2 ring-white' : ''
              }`}
              data-testid={`player-${player.id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white truncate">{player.name}</h3>
                {player.id === gameState.current_player_id && (
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                )}
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-white/60">
                  <span>Cartas:</span>
                  <span className="text-white font-semibold">{player.hand_count}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Puntos:</span>
                  <span className="text-white font-semibold">{player.score}</span>
                </div>
                {player.warnings > 0 && (
                  <div className="flex items-center gap-1 text-yellow-400 text-xs">
                    <AlertCircle className="h-3 w-3" />
                    <span>{player.warnings} advertencia(s)</span>
                  </div>
                )}
                {player.has_laid_down && (
                  <div className="text-green-400 text-xs font-semibold">
                    ✓ Ha bajado
                  </div>
                )}
              </div>

              {/* Player's melds */}
              {player.melds && player.melds.length > 0 && (
                <div className="space-y-2 mt-2">
                  {player.melds.map((meld, idx) => (
                    <div key={idx} className="flex flex-wrap gap-1">
                      <FanCards
                        cards={meld.cards}
                        meldType={meld.type}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
            </div>
          </div>
        </div>

        {/* Turn Order Display */}
        <div className="glass-card p-3 md:p-4 mb-3 md:mb-6">
          <h3 className="text-sm md:text-base font-semibold text-white mb-3">Orden de Turnos</h3>
          <div className="flex flex-wrap gap-2 items-center">
            {gameState.players.map((player, index) => (
              <div key={player.id} className="flex items-center gap-2">
                <div
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    player.id === gameState.current_player_id
                      ? 'bg-green-600 text-white ring-2 ring-green-400 shadow-lg'
                      : player.id === playerId
                      ? 'bg-blue-600/30 text-blue-200 border border-blue-400'
                      : 'bg-white/10 text-white/80'
                  }`}
                >
                  {player.name}
                  {player.id === playerId && ' (Tú)'}
                  {player.id === gameState.current_player_id && ' ⚡'}
                </div>
                {index < gameState.players.length - 1 && (
                  <span className="text-white/40 text-lg">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Game Table - More compact on mobile */}
        <div className="game-table game-table-mobile mb-3 md:mb-6" data-testid="game-table">
          <div className="flex items-center justify-center gap-4 md:gap-8 mb-4">
            {/* Deck */}
            <div className="text-center">
              <div
                onClick={() => drawCard('deck')}
                className="card-back cursor-pointer hover:scale-105 transition-transform"
                data-testid="draw-deck-button"
              >
                <div className="card-back-pattern"></div>
                <div className="card-count-badge">
                  {gameState.deck_count}
                </div>
              </div>
              <div className="text-white/60 text-sm mt-2">Mazo</div>
            </div>

            {/* Discard Pile */}
            <div className="text-center relative">
              {gameState.discard_pile_top ? (
                <div className="flex flex-col items-center">
                  <div 
                    className={`discard-area flex items-center justify-center ${
                      canRequestCard ? 'active' : ''
                    }`}
                    style={{ 
                      width: '96px', 
                      height: '128px',
                      transition: 'none'
                    }}
                    onClick={() => {
                      if (canRequestCard) {
                        requestDiscardCard();
                      } else if (isMyTurn() && gameState.turn_phase === 'draw' && !gameState.has_drawn) {
                        drawCard('discard');
                      }
                    }}
                  >
                    <Card
                      card={gameState.discard_pile_top}
                      className="cursor-pointer"
                      data-testid="draw-discard-button"
                    />
                  </div>
                  {gameState.waiting_for_requests && waitTimeLeft > 0 && (
                    <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-full border border-white/20">
                      <Timer className="h-4 w-4 text-white animate-pulse" />
                      <span className="text-white font-bold text-lg">{waitTimeLeft}s</span>
                    </div>
                  )}
                  {isMyTurn() && gameState.turn_phase === 'action' && (
                    <div className="text-xs text-white/60 mt-1">Ya has robado</div>
                  )}
                  {!isMyTurn() && !canRequestCard && (
                    <div className="text-xs text-white/60 mt-1">Espera al descarte</div>
                  )}
                  {canRequestCard && (
                    <div className="text-xs text-green-400 mt-2 font-semibold animate-pulse">
                      ¡Haz clic para solicitar!
                    </div>
                  )}
                </div>
              ) : (
                <div className="discard-area empty">
                  <div className="text-sm text-white/60">Vacío</div>
                </div>
              )}
              <div className="text-white/60 text-sm mt-2">Descarte</div>
            </div>
          </div>

          {/* Turn Indicator */}
          {isMyTurn() && !gameState.waiting_for_requests && (
            <div className="text-center mb-4">
              <div className="inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full font-semibold player-indicator" data-testid="your-turn-indicator">
                <span>TU TURNO</span>
                {gameState.turn_phase === 'draw' && !gameState.has_drawn && <span>- Roba una carta</span>}
                {gameState.turn_phase === 'action' && !gameState.has_laid_down && <span>- Baja cartas o descarta</span>}
                {gameState.turn_phase === 'action' && gameState.has_laid_down && <span>- Coloca o descarta</span>}
              </div>
            </div>
          )}

          {/* Waiting Period Message */}
          {gameState.waiting_for_requests && (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-full font-semibold animate-pulse">
                <Timer className="h-5 w-5" />
                <span>Período de solicitud activo - {waitTimeLeft}s</span>
              </div>
            </div>
          )}

          {/* First Draw Message */}
          {gameState.first_draw_of_round && !isMyTurn() && gameState.discard_pile_top && (
            <div className="text-center mt-4">
              <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-full font-semibold">
                <span>Puedes solicitar la carta inicial</span>
              </div>
            </div>
          )}
        </div>

        {/* My Hand */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Tu Mano ({gameState.my_hand?.length || 0} cartas)</h3>
            <div className="flex gap-2 flex-wrap justify-end">
              {/* Create Set/Run buttons - only before laying down */}
              {selectedCards.length >= 3 && !gameState.has_laid_down && gameState.has_drawn && (
                <>
                  <Button
                    onClick={() => createMeld('set')}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="create-set-button"
                  >
                    Crear Trío
                  </Button>
                  <Button
                    onClick={() => createMeld('run')}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    data-testid="create-run-button"
                  >
                    Crear Escalera
                  </Button>
                </>
              )}
              
              {/* Lay Down button */}
              {selectedMelds.length > 0 && !gameState.has_laid_down && (
                <>
                  <Button
                    onClick={layDownMelds}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="lay-down-button"
                  >
                    Bajar Cartas ({selectedMelds.length} comb.)
                  </Button>
                  <Button
                    onClick={clearMelds}
                    size="sm"
                    variant="outline"
                    className="border-white/20 hover:bg-white/10 text-white"
                  >
                    Cancelar
                  </Button>
                </>
              )}
              
              {/* Place button - only after laying down */}
              {selectedCards.length === 1 && canPlaceCards && (
                <Button
                  onClick={openPlaceCardPopup}
                  size="sm"
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  data-testid="place-card-button"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Colocar
                </Button>
              )}
              
              {/* Discard button */}
              {selectedCards.length === 1 && gameState.has_drawn && isMyTurn() && (
                <Button
                  onClick={() => discardCard(selectedCards[0])}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  data-testid="discard-selected-button"
                >
                  Descartar <ArrowDown className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>

          {/* Pending Melds Preview */}
          {selectedMelds.length > 0 && (
            <div className="meld-container mb-4">
              <div className="meld-label">Combinaciones a bajar:</div>
              <div className="space-y-2">
                {selectedMelds.map((meld, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-sm text-white/80">
                      {meld.type === 'set' ? 'Trío' : 'Escalera'} ({meld.card_ids.length} cartas)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-grid card-grid-mobile" data-testid="my-hand">
            {gameState.my_hand && gameState.my_hand.map((card, index) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => handleDragStart(e, card, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => {
                  handleTouchStart(e, card, index);
                }}
                onTouchMove={(e) => {
                  handleTouchMove(e, index);
                }}
                onTouchEnd={(e) => {
                  handleTouchEnd(e, index);
                }}
                onTouchCancel={handleTouchCancel}
                onContextMenu={(e) => e.preventDefault()}
                className={`card-slot ${dragOverIndex === index ? 'drag-over' : ''} ${
                  touchDragActive && draggedCard?.index === index ? 'touch-dragging' : ''
                }`}
              >
                <Card
                  card={card}
                  selected={selectedCards.includes(card.id)}
                  onClick={(e) => {
                    // Only allow click if not in touch drag mode
                    if (!touchDragActive && !longPressTriggered) {
                      toggleCardSelection(card.id);
                    }
                  }}
                  className={draggedCard?.index === index ? 'card-dragging' : ''}
                  data-testid={`card-${card.id}`}
                />
              </div>
            ))}
          </div>

          {/* My Melds - Collapsible on mobile */}
          {myPlayer?.melds && myPlayer.melds.length > 0 && (
            <div className="mt-3 md:mt-6">
              <div
                className="md:hidden mobile-section-header"
                onClick={() => setShowMyMelds(!showMyMelds)}
              >
                <span className="mobile-section-title">
                  Tus Combinaciones ({myPlayer.melds.length})
                </span>
                <ChevronDown className={`h-4 w-4 section-toggle-icon ${showMyMelds ? 'rotated' : ''}`} />
              </div>
              <h4 className="hidden md:block text-lg font-semibold text-white mb-3">Tus Combinaciones</h4>
              <div className={`mobile-section-content ${showMyMelds ? 'expanded' : ''} md:!max-h-none space-y-3`}>
                {myPlayer.melds.map((meld, idx) => (
                  <div key={idx} className="meld-container" data-testid={`my-meld-${idx}`}>
                    <div className="meld-label">{meld.type === 'set' ? 'Trío' : 'Escalera'}</div>
                    <div className="flex flex-wrap gap-2">
                      <FanCards
                        cards={meld.cards}
                        meldType={meld.type}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Place Card Popup */}
      {showPlaceCardPopup && cardToPlace && (
        <PlaceCardPopup
          show={showPlaceCardPopup}
          card={cardToPlace}
          players={gameState.players.filter(p => p.has_laid_down)}
          onClose={() => {
            setShowPlaceCardPopup(false);
            setCardToPlace(null);
            setSelectedCards([]);
          }}
          onPlaceCard={handlePlaceCard}
          onReplaceJoker={handleReplaceJoker}
        />
      )}
    </div>
  );
}