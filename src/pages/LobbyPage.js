import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Copy, Users, Crown, X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https', 'wss').replace('http', 'ws');

export default function LobbyPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const playerId = localStorage.getItem('player_id');

  useEffect(() => {
    if (!playerId) {
      navigate('/');
      return;
    }

    loadRoom();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomCode, playerId, navigate]);

  const loadRoom = async () => {
    try {
      const response = await axios.get(`${API}/room/${roomCode}`);
      console.log('=== DEBUG ROOM DATA ===');
      console.log('Full room data:', JSON.stringify(response.data, null, 2));
      console.log('Host ID from room:', response.data.host_id);
      console.log('Player ID from localStorage:', playerId);
      console.log('Players:', response.data.players);
      console.log('Is host check:', response.data.host_id === playerId);
      console.log('typeof host_id:', typeof response.data.host_id);
      console.log('typeof playerId:', typeof playerId);
      console.log('======================');
      setRoom(response.data);
    } catch (error) {
      console.error('Error al cargar sala:', error);
      toast.error('Sala no encontrada');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(`${WS_URL}/api/ws/${roomCode}/${playerId}`);
    
    ws.onopen = () => {
      console.log('WebSocket conectado');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'player_joined') {
        loadRoom();
        toast.success(`${data.player.name} se unió a la sala`);
      } else if (data.type === 'player_kicked') {
        if (data.player_id === playerId) {
          toast.error('Has sido expulsado de la sala');
          navigate('/');
        } else {
          loadRoom();
        }
      } else if (data.type === 'game_state') {
        // Game started, navigate to game page
        navigate(`/game/${roomCode}`);
      } else if (data.type === 'game_started') {
        // Game started, navigate to game page
        navigate(`/game/${roomCode}`);
      } else if (data.type === 'player_disconnected') {
        loadRoom();
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket desconectado');
    };

    wsRef.current = ws;
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success('¡Código de sala copiado!');
  };

  const startGame = () => {
    if (room?.players.length < 2) {
      toast.error('Se necesitan al menos 2 jugadores para comenzar');
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'start_game' }));
    }
  };

  const kickPlayer = (targetPlayerId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'kick_player',
        target_player_id: targetPlayerId
      }));
    }
  };

  const isHost = room?.host_id === playerId;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-2xl">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <div className="max-w-3xl w-full">
        <Card className="glass-card border-white/10" data-testid="lobby-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-3xl text-white mb-2" data-testid="lobby-title">Sala de Juego</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-white/60">Código de Sala:</span>
                  <code className="bg-white/10 px-3 py-1 rounded text-white font-mono text-lg border border-white/10" data-testid="room-code">
                    {roomCode}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyRoomCode}
                    className="text-white hover:bg-white/10"
                    data-testid="copy-code-button"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <Users className="h-5 w-5" />
                <span data-testid="player-count">{room?.players.length || 0}/10</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-white mb-4">Jugadores</h3>
              <div className="space-y-2">
                {room?.players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10"
                    data-testid={`player-item-${player.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {player.is_host && <Crown className="h-5 w-5 text-yellow-400" />}
                      <span className="text-white font-medium" data-testid={`player-name-${player.id}`}>
                        {player.name}
                      </span>
                      {player.id === playerId && (
                        <span className="text-sm text-emerald-400">(Tú)</span>
                      )}
                    </div>
                    {isHost && !player.is_host && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => kickPlayer(player.id)}
                        className="text-red-400 hover:bg-red-400/10"
                        data-testid={`kick-player-${player.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {isHost ? (
              <Button
                onClick={startGame}
                disabled={!room || room.players.length < 2}
                className="w-full bg-white text-black hover:bg-white/90 font-semibold py-6 text-lg"
                data-testid="start-game-button"
              >
                Iniciar Juego
              </Button>
            ) : (
              <div className="text-center text-white/60" data-testid="waiting-message">
                Esperando que el anfitrión inicie el juego...
              </div>
            )}

            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="w-full border-white/20 text-white hover:bg-white/10"
              data-testid="leave-lobby-button"
            >
              Salir del Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}