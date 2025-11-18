import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card as UICard, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowDown, Users, AlertCircle, Timer, Plus, ChevronDown, Menu, X, Flag, Zap, SkipForward, Edit3, Crown } from 'lucide-react';
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
  const [showMenu, setShowMenu] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [selectedRound, setSelectedRound] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [newScore, setNewScore] = useState('');

  // Define callbacks before useEffect that uses them
  const loadRoomData = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/room/${roomCode}`);
      const data = await response.json();
      console.log('=== DEBUG GAME PAGE ROOM DATA ===');
      console.log('Room data:', data);
      console.log('Host ID:', data.host_id);
      console.log('Player ID:', playerId);
      console.log('Is host:', data.host_id === playerId);
      console.log('================================');
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
      } else if (data.type === 'player_left') {
        // Jugador abandonó la partida
        toast.info(data.message || `${data.player_name} ha abandonado la partida`);
      } else if (data.type === 'player_joined') {
        // Jugador se unió (incluyendo mid-game)
        if (data.mid_game_join) {
          toast.info(`${data.player.name} se unió con ${data.player.score} puntos`);
        } else {
          toast.info(`${data.player.name} se unió a la sala`);
        }
      } else if (data.type === 'host_transferred') {
        // Transferencia de host
        toast.info(data.message);
        if (data.new_host_id === playerId) {
          toast.success('¡Ahora eres el anfitrión!');
        }
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
        console.log('App became visible - refreshing game state');

        // Always reload room data to sync state when returning
        loadRoomData();

        // Check if WebSocket is disconnected or closing
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('WebSocket disconnected, reconnecting...');

          // Close old connection if it exists
          if (wsRef.current) {
            wsRef.current.close();
          }

          // Reconnect WebSocket
          connectWebSocket();
        } else {
          // Even if WebSocket is connected, request fresh game state
          console.log('WebSocket connected, requesting fresh game state');
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'get_state' }));
          }
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
    // Si acabamos de completar la ronda 7, el juego debería terminar
    if (gameState?.round === 7) {
      console.log('Ronda 7 completada, estableciendo game_over manualmente');
      // Forzar actualización del estado local para mostrar pantalla de juego terminado
      setGameState(prev => ({ ...prev, game_over: true, round_ended: false }));
    } else {
      sendAction('continue_to_next_round');
    }
  };

  const handleLeaveGame = () => {
    // Enviar acción al backend
    sendAction('leave_game');

    // Cerrar WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Redirigir al home
    navigate('/');

    // Mostrar mensaje
    toast.success('Has abandonado la partida');
  };

  // Funciones de control del host
  const handleEndRound = (countPoints) => {
    sendAction('host_end_round', { count_points: countPoints });
    setShowMenu(false);
    setActiveSubmenu(null);
  };

  const handleEndGame = (countPoints) => {
    sendAction('host_end_game', { count_points: countPoints });
    setShowMenu(false);
    setActiveSubmenu(null);
  };

  const handleJumpToRound = (targetRound, countPoints) => {
    sendAction('host_jump_to_round', {
      target_round: targetRound,
      count_points: countPoints
    });
    setSelectedRound(null);
    setShowMenu(false);
    setActiveSubmenu(null);
  };

  const handleChangePlayerScore = () => {
    if (!selectedPlayerId || newScore === '') return;

    const score = parseInt(newScore, 10);
    if (isNaN(score) || score < 0) {
      toast.error('Por favor introduce un número válido (0 o mayor)');
      return;
    }

    sendAction('host_change_player_score', {
      target_player_id: selectedPlayerId,
      new_score: score
    });
    setSelectedPlayerId(null);
    setNewScore('');
    setShowMenu(false);
    setActiveSubmenu(null);
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
  const isHost = roomData?.host_id === playerId;

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
        roomCode={roomCode}
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
    <div className="min-h-screen bg-black text-white p-1 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header - Compact */}
        <div className="glass-card p-1.5 mb-2" data-testid="game-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm md:text-2xl font-bold">Continental - Ronda {gameState.round}</h1>
              <div className="text-[0.65rem] md:text-sm text-white/60">
                Código: <code className="text-white">{roomCode}</code>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-[0.65rem] md:text-sm text-white/60">Objetivo:</div>
                <div className="text-white text-[0.7rem] md:text-base font-semibold">
                  {gameState.round_requirements.sets.length > 0 && (
                    <span>{gameState.round_requirements.sets.length} Trío(s) </span>
                  )}
                  {gameState.round_requirements.runs.length > 0 && (
                    <span>{gameState.round_requirements.runs.length} Escalera(s)</span>
                  )}
                  {gameState.round === 7 && <span>3 Escaleras + Bajar todo</span>}
                </div>
              </div>
              {/* Botón del menú hamburguesa */}
              <button
                onClick={() => setShowMenu(true)}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5 md:h-6 md:w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Other Players - Always visible, compact */}
        <div className="mb-2">
          <div className={`grid gap-1.5 ${
            gameState.players.length <= 2 ? 'grid-cols-1' :
            gameState.players.length <= 3 ? 'grid-cols-2' :
            gameState.players.length <= 4 ? 'grid-cols-3' :
            'grid-cols-4'
          }`}>
          {gameState.players.filter(p => p.id !== playerId).map((player) => (
            <div
              key={player.id}
              className={`glass-card p-1.5 ${
                player.id === gameState.current_player_id ? 'ring-1 ring-green-400' : ''
              }`}
              data-testid={`player-${player.id}`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <h3 className="text-xs font-semibold text-white truncate">{player.name}</h3>
                {player.id === gameState.current_player_id && (
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                )}
              </div>

              <div className="flex justify-between text-[0.65rem] text-white/60 mb-1">
                <span>Cartas: <span className="text-white font-semibold">{player.hand_count}</span></span>
                <span>Puntos: <span className="text-white font-semibold">{player.score}</span></span>
              </div>

              {/* Player's melds - always visible, very compact */}
              {player.melds && player.melds.length > 0 && (
                <div className="player-melds-container">
                  {player.melds.map((meld, idx) => (
                    <FanCards
                      key={idx}
                      cards={meld.cards}
                      meldType={meld.type}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>

        {/* Game Table & Turn Order - Side by side */}
        <div className="flex gap-2 mb-2">
          {/* Game Table - Compact */}
          <div className="glass-card p-1.5 flex-1" data-testid="game-table">
            <div className="game-table-inner">
              {/* Deck and Discard Area */}
              <div className="deck-area">
                <div className="flex items-center justify-center gap-2">
                  {/* Deck */}
                  <div className="text-center">
                    <div
                      onClick={() => drawCard('deck')}
                      className="cursor-pointer hover:scale-105 transition-transform"
                      style={{ width: '60px', height: '84px', position: 'relative' }}
                      data-testid="draw-deck-button"
                    >
                      <div className="card-back" style={{ width: '60px', height: '84px' }}>
                        <div className="card-back-pattern"></div>
                        <div className="card-count-badge" style={{ fontSize: '0.875rem', padding: '4px 8px' }}>
                          {gameState.deck_count}
                        </div>
                      </div>
                    </div>
                    <div className="text-white/60 text-[0.65rem] mt-0.5">Mazo</div>
                  </div>

                  {/* Discard Pile */}
                  <div className="text-center relative">
                    {gameState.discard_pile_top ? (
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex items-center justify-center rounded-lg ${
                            canRequestCard ? 'ring-2 ring-green-400' : 'bg-white/5'
                          }`}
                          style={{
                            width: '60px',
                            height: '84px',
                            padding: '4px'
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
                            style={{ width: '56px', height: '78px' }}
                            data-testid="draw-discard-button"
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '60px', height: '84px' }} className="flex items-center justify-center bg-white/5 rounded-lg border border-dashed border-white/20">
                        <div className="text-[0.65rem] text-white/60">Vacío</div>
                      </div>
                    )}
                    <div className="text-white/60 text-[0.65rem] mt-0.5">Descarte</div>
                  </div>
                </div>
              </div>

              {/* Turn Indicators - Will appear on left in landscape */}
              <div className="turn-indicators">
                {/* Turn Indicator - Compact */}
                {isMyTurn() && !gameState.waiting_for_requests && (
                  <div className="text-center">
                    <div className="inline-flex items-center gap-1 bg-white text-black px-2 py-0.5 rounded-full text-[0.7rem] font-semibold" data-testid="your-turn-indicator">
                      <span>TU TURNO</span>
                      {gameState.turn_phase === 'draw' && !gameState.has_drawn && <span>- Roba</span>}
                      {gameState.turn_phase === 'action' && !gameState.has_laid_down && <span>- Baja o descarta</span>}
                      {gameState.turn_phase === 'action' && gameState.has_laid_down && <span>- Coloca o descarta</span>}
                    </div>
                  </div>
                )}

                {/* Waiting Period Message - Compact */}
                {gameState.waiting_for_requests && (
                  <div className="text-center">
                    <div className="inline-flex items-center gap-1 bg-green-600 text-white px-2 py-0.5 rounded-full text-[0.7rem] font-semibold animate-pulse">
                      <Timer className="h-3 w-3" />
                      <span>Solicitud activa - {waitTimeLeft}s</span>
                    </div>
                  </div>
                )}

                {/* First Draw Message - Compact */}
                {gameState.first_draw_of_round && !isMyTurn() && gameState.discard_pile_top && (
                  <div className="text-center">
                    <div className="inline-flex items-center gap-1 bg-blue-600 text-white px-2 py-0.5 rounded-full text-[0.7rem] font-semibold">
                      <span>Solicitar carta inicial</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Turn Order Display - Compact, Dynamic Width */}
          <div className="glass-card p-1.5 w-auto">
            <h3 className="text-[0.65rem] font-semibold text-white/80 mb-1 text-center">Turnos</h3>
            <div className="flex flex-col gap-1 items-center">
              {gameState.players.map((player) => (
                <div key={player.id}>
                  <div
                    className={`px-2 py-0.5 rounded text-[0.65rem] font-medium whitespace-nowrap ${
                      player.id === gameState.current_player_id
                        ? 'bg-green-600 text-white ring-1 ring-green-400'
                        : player.id === playerId
                        ? 'bg-blue-600/30 text-blue-200 border border-blue-400'
                        : 'bg-white/10 text-white/70'
                    }`}
                  >
                    {player.name}
                    {player.id === playerId && ' (Tú)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* My Hand & Melds Wrapper - responsive to orientation */}
        <div className="hand-melds-wrapper">
          {/* My Hand */}
          <div className="glass-card p-1.5 hand-section">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-bold text-white">Tu Mano ({gameState.my_hand?.length || 0})</h3>
              <div className="flex gap-1 flex-wrap justify-end">
                {/* Create Set/Run buttons - only before laying down */}
                {selectedCards.length >= 3 && !gameState.has_laid_down && gameState.has_drawn && (
                  <>
                    <Button
                      onClick={() => createMeld('set')}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[0.7rem] px-2 py-1 h-auto"
                      data-testid="create-set-button"
                    >
                      Trío
                    </Button>
                    <Button
                      onClick={() => createMeld('run')}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white text-[0.7rem] px-2 py-1 h-auto"
                      data-testid="create-run-button"
                    >
                      Escalera
                    </Button>
                  </>
                )}

                {/* Lay Down button */}
                {selectedMelds.length > 0 && !gameState.has_laid_down && (
                  <>
                    <Button
                      onClick={layDownMelds}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white text-[0.7rem] px-2 py-1 h-auto"
                      data-testid="lay-down-button"
                    >
                      Bajar ({selectedMelds.length})
                    </Button>
                    <Button
                      onClick={clearMelds}
                      size="sm"
                      variant="outline"
                      className="border-white/20 hover:bg-white/10 text-white text-[0.7rem] px-2 py-1 h-auto"
                    >
                      ✕
                    </Button>
                  </>
                )}

                {/* Place button - only after laying down */}
                {selectedCards.length === 1 && canPlaceCards && (
                  <Button
                    onClick={openPlaceCardPopup}
                    size="sm"
                    className="bg-cyan-600 hover:bg-cyan-700 text-white text-[0.7rem] px-2 py-1 h-auto"
                    data-testid="place-card-button"
                  >
                    <Plus className="h-3 w-3 mr-0.5" />
                    Colocar
                  </Button>
                )}

                {/* Discard button */}
                {selectedCards.length === 1 && gameState.has_drawn && isMyTurn() && (
                  <Button
                    onClick={() => discardCard(selectedCards[0])}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white text-[0.7rem] px-2 py-1 h-auto"
                    data-testid="discard-selected-button"
                  >
                    Descartar <ArrowDown className="h-3 w-3 ml-0.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Pending Melds Preview */}
            {selectedMelds.length > 0 && (
              <div className="bg-white/5 rounded p-1 mb-1.5">
                <div className="text-[0.65rem] text-white/60 mb-0.5">A bajar:</div>
                <div className="space-y-0.5">
                  {selectedMelds.map((meld, idx) => (
                    <div key={idx} className="text-[0.65rem] text-white/80">
                      {meld.type === 'set' ? 'Trío' : 'Escalera'} ({meld.card_ids.length})
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
          </div>

          {/* My Melds - Separate section, responsive to orientation */}
          {myPlayer?.melds && myPlayer.melds.length > 0 && (
            <div className="glass-card p-1.5 own-melds-section">
              <h4 className="text-xs font-semibold text-white/80 mb-1">Tus Combinaciones</h4>
              <div className="own-melds-container">
                {myPlayer.melds.map((meld, idx) => (
                  <FanCards
                    key={idx}
                    cards={meld.cards}
                    meldType={meld.type}
                    data-testid={`my-meld-${idx}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Menu Modal */}
      {showMenu && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => {
            setShowMenu(false);
            setActiveSubmenu(null);
            setSelectedRound(null);
            setSelectedPlayerId(null);
            setNewScore('');
          }}
        >
          <div
            className="glass-card p-6 max-w-sm w-full mx-4 relative max-h-[90vh] overflow-y-auto border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botón de cerrar (X) */}
            <button
              onClick={() => {
                setShowMenu(false);
                setActiveSubmenu(null);
                setSelectedRound(null);
                setSelectedPlayerId(null);
                setNewScore('');
              }}
              className="absolute top-4 right-4 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Contenido del menú */}
            <div className="flex items-center gap-3 mb-6">
              {isHost && <Crown className="h-6 w-6 text-yellow-400" />}
              <h3 className="text-2xl font-bold text-white">
                {isHost ? 'Panel de Control' : 'Menú'}
              </h3>
            </div>

            {/* Controles del Host */}
            {isHost && (
              <div className="mb-4 pb-4 border-b border-white/20">
                <h4 className="text-xs font-semibold text-white/60 mb-3 uppercase tracking-wide">
                  Controles del Anfitrión
                </h4>

                {/* Finalizar Ronda */}
                <div className="mb-2">
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'end-round' ? null : 'end-round')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-white text-sm font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4" />
                      <span>Finalizar Ronda</span>
                    </div>
                    <span className={`transform transition-transform ${activeSubmenu === 'end-round' ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                  {activeSubmenu === 'end-round' && (
                    <div className="mt-2 ml-4 space-y-1">
                      <button
                        onClick={() => {
                          if (window.confirm('¿Finalizar ronda y contar puntos?')) {
                            handleEndRound(true);
                          }
                        }}
                        className="w-full p-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded text-white text-xs"
                      >
                        Contar Puntos
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('¿Finalizar ronda sin contar puntos (0 pts)?')) {
                            handleEndRound(false);
                          }
                        }}
                        className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white text-xs"
                      >
                        Sin Contar Puntos (0 pts)
                      </button>
                    </div>
                  )}
                </div>

                {/* Finalizar Partida */}
                <div className="mb-2">
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'end-game' ? null : 'end-game')}
                    className="w-full flex items-center justify-between p-3 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 rounded-lg transition-colors text-white text-sm font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      <span>Finalizar Partida</span>
                    </div>
                    <span className={`transform transition-transform ${activeSubmenu === 'end-game' ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                  {activeSubmenu === 'end-game' && (
                    <div className="mt-2 ml-4 space-y-1">
                      <button
                        onClick={() => {
                          if (window.confirm('¿Finalizar partida y contar puntos?')) {
                            handleEndGame(true);
                          }
                        }}
                        className="w-full p-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded text-white text-xs"
                      >
                        Contar Puntos
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('¿Finalizar partida sin contar puntos (0 pts)?')) {
                            handleEndGame(false);
                          }
                        }}
                        className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white text-xs"
                      >
                        Sin Contar Puntos (0 pts)
                      </button>
                    </div>
                  )}
                </div>

                {/* Saltar a Ronda */}
                <div className="mb-2">
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'jump-round' ? null : 'jump-round')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-white text-sm font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <SkipForward className="h-4 w-4" />
                      <span>Saltar a Ronda</span>
                    </div>
                    <span className={`transform transition-transform ${activeSubmenu === 'jump-round' ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                  {activeSubmenu === 'jump-round' && (
                    <div className="mt-2 ml-4">
                      {!selectedRound ? (
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {[
                            { round: 1, name: 'Ronda 1: 2 Tríos' },
                            { round: 2, name: 'Ronda 2: 1 Trío + 1 Escalera' },
                            { round: 3, name: 'Ronda 3: 2 Escaleras' },
                            { round: 4, name: 'Ronda 4: 3 Tríos' },
                            { round: 5, name: 'Ronda 5: 2 Tríos + 1 Escalera' },
                            { round: 6, name: 'Ronda 6: 1 Trío + 2 Escaleras' },
                            { round: 7, name: 'Ronda 7: 3 Escaleras' }
                          ].map(({ round, name }) => (
                            <button
                              key={round}
                              onClick={() => setSelectedRound(round)}
                              className="w-full p-2 bg-white/5 hover:bg-blue-600/30 border border-white/10 rounded text-white text-xs text-left"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-blue-400 p-2 bg-blue-600/20 border-l-2 border-blue-600 rounded">
                            Ronda {selectedRound}
                          </p>
                          <button
                            onClick={() => {
                              if (window.confirm(`¿Saltar a ronda ${selectedRound} contando puntos?`)) {
                                handleJumpToRound(selectedRound, true);
                              }
                            }}
                            className="w-full p-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded text-white text-xs"
                          >
                            Contar Puntos
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`¿Saltar a ronda ${selectedRound} sin contar puntos?`)) {
                                handleJumpToRound(selectedRound, false);
                              }
                            }}
                            className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white text-xs"
                          >
                            Sin Contar Puntos (0 pts)
                          </button>
                          <button
                            onClick={() => setSelectedRound(null)}
                            className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white text-xs"
                          >
                            ← Volver
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cambiar Puntos */}
                <div className="mb-2">
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === 'change-score' ? null : 'change-score')}
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-white text-sm font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <Edit3 className="h-4 w-4" />
                      <span>Cambiar Puntos</span>
                    </div>
                    <span className={`transform transition-transform ${activeSubmenu === 'change-score' ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                  {activeSubmenu === 'change-score' && (
                    <div className="mt-2 ml-4 space-y-2">
                      <label className="text-xs font-semibold text-white/80 mb-1 block">Jugador:</label>
                      <select
                        value={selectedPlayerId || ''}
                        onChange={(e) => {
                          setSelectedPlayerId(e.target.value);
                          const player = gameState?.players.find(p => p.id === e.target.value);
                          if (player) {
                            setNewScore(player.score.toString());
                          }
                        }}
                        className="w-full p-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white text-xs transition-colors focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                      >
                        <option value="" className="bg-gray-800">Selecciona un jugador</option>
                        {gameState?.players.map(player => (
                          <option key={player.id} value={player.id} className="bg-gray-800">
                            {player.name} ({player.score} pts)
                          </option>
                        ))}
                      </select>

                      {selectedPlayerId && (
                        <>
                          <label className="text-xs font-semibold text-white/80 mb-1 block">Nuevos Puntos:</label>
                          <input
                            type="number"
                            min="0"
                            value={newScore}
                            onChange={(e) => setNewScore(e.target.value)}
                            placeholder="0"
                            className="w-full p-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white text-xs transition-colors focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                          />
                          <button
                            onClick={handleChangePlayerScore}
                            className="w-full p-2 bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 rounded text-white text-xs font-medium"
                          >
                            Guardar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Abandonar Partida (todos) */}
            <button
              onClick={() => {
                if (window.confirm('¿Estás seguro de que quieres abandonar la partida?')) {
                  handleLeaveGame();
                }
              }}
              className="w-full py-3 px-4 bg-red-600/20 hover:bg-red-600/30 border-2 border-red-600/50 text-white font-semibold rounded-lg transition-colors"
            >
              Abandonar Partida
            </button>
          </div>
        </div>
      )}

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