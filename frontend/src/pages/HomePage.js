import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

export default function HomePage() {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  const createRoom = async () => {
    if (!playerName.trim()) {
      toast.error('Por favor ingresa tu nombre');
      return;
    }

    setIsCreating(true);
    try {
      const response = await axios.post(`${API}/room/create`, {
        player_name: playerName
      });
      
      const { room_code, player_id } = response.data;
      localStorage.setItem('player_id', player_id);
      localStorage.setItem('player_name', playerName);
      
      toast.success('¡Sala creada!');
      navigate(`/lobby/${room_code}`);
    } catch (error) {
      console.error('Error al crear sala:', error);
      toast.error(error.response?.data?.detail || 'Error al crear la sala');
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) {
      toast.error('Por favor ingresa tu nombre y código de sala');
      return;
    }

    setIsJoining(true);
    try {
      const response = await axios.post(`${API}/room/join`, {
        room_code: roomCode.toUpperCase(),
        player_name: playerName
      });
      
      const { player_id } = response.data;
      localStorage.setItem('player_id', player_id);
      localStorage.setItem('player_name', playerName);
      
      toast.success('¡Te uniste a la sala!');
      navigate(`/lobby/${roomCode.toUpperCase()}`);
    } catch (error) {
      console.error('Error al unirse:', error);
      toast.error(error.response?.data?.detail || 'Error al unirse a la sala');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-4" data-testid="game-title">
            Continental
          </h1>
          <p className="text-lg text-white/60">Juego de cartas clásico de 7 rondas</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="glass-card border-white/10" data-testid="create-room-card">
            <CardHeader>
              <CardTitle className="text-2xl text-white">Crear Sala</CardTitle>
              <CardDescription className="text-white/60">Inicia un nuevo juego e invita amigos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Tu Nombre"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                data-testid="create-room-name-input"
                onKeyPress={(e) => e.key === 'Enter' && createRoom()}
              />
              <Button
                onClick={createRoom}
                disabled={isCreating}
                className="w-full bg-white text-black hover:bg-white/90 font-semibold"
                data-testid="create-room-button"
              >
                {isCreating ? 'Creando...' : 'Crear Sala'}
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/10" data-testid="join-room-card">
            <CardHeader>
              <CardTitle className="text-2xl text-white">Unirse a Sala</CardTitle>
              <CardDescription className="text-white/60">Ingresa un código de sala para unirte</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Tu Nombre"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                data-testid="join-room-name-input"
              />
              <Input
                placeholder="Código de Sala (ej. ABC123)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                data-testid="join-room-code-input"
                onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
              />
              <Button
                onClick={joinRoom}
                disabled={isJoining}
                className="w-full bg-white/10 border border-white/20 text-white hover:bg-white/20 font-semibold"
                data-testid="join-room-button"
              >
                {isJoining ? 'Uniéndose...' : 'Unirse'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 glass-card p-6" data-testid="game-rules-card">
          <h2 className="text-2xl font-bold text-white mb-4">Objetivos por Ronda</h2>
          <div className="text-white/80 space-y-2 text-sm">
            <p><strong className="text-white">Ronda 1:</strong> 2 tríos de 3 cartas</p>
            <p><strong className="text-white">Ronda 2:</strong> 1 trío + 1 escalera de 4</p>
            <p><strong className="text-white">Ronda 3:</strong> 2 escaleras de 4</p>
            <p><strong className="text-white">Ronda 4:</strong> 3 tríos</p>
            <p><strong className="text-white">Ronda 5:</strong> 2 tríos + 1 escalera</p>
            <p><strong className="text-white">Ronda 6:</strong> 1 trío + 2 escaleras</p>
            <p><strong className="text-white">Ronda 7:</strong> Bajar todas las cartas en un turno</p>
            <p className="mt-4 pt-4 border-t border-white/20">
              <strong className="text-white">Trío:</strong> 3+ cartas del mismo número | 
              <strong className="text-white ml-2">Escalera:</strong> 4+ cartas consecutivas del mismo palo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}