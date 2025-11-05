from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Optional, Any
import uuid
from datetime import datetime, timezone
import json
import random
import asyncio
import time
from game_logic import (
    create_deck, get_num_decks, ROUND_REQUIREMENTS,
    validate_set, validate_run, validate_meld_group,
    calculate_hand_points, calculate_negative_points,
    get_card_value
)

def find_closest_next_player(current_index: int, requesting_players: List[str], all_players: List[Dict]) -> Optional[str]:
    """Find the requesting player with the nearest turn after current player"""
    if not requesting_players:
        return None
    
    num_players = len(all_players)
    player_id_to_index = {p['id']: i for i, p in enumerate(all_players)}
    
    # Calculate distance from current player for each requester
    distances = []
    for req_player_id in requesting_players:
        if req_player_id in player_id_to_index:
            req_index = player_id_to_index[req_player_id]
            # Calculate forward distance (wrapping around)
            distance = (req_index - current_index - 1) % num_players
            distances.append((distance, req_player_id))
    
    if distances:
        # Sort by distance and return closest
        distances.sort()
        return distances[0][1]
    
    return None

# Configure logging FIRST before using it
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'continental_game')]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.pending_card_requests: Dict[str, List[Dict]] = {}

    async def connect(self, websocket: WebSocket, room_code: str, player_id: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = {}
        self.active_connections[room_code][player_id] = websocket

    def disconnect(self, room_code: str, player_id: str):
        if room_code in self.active_connections:
            if player_id in self.active_connections[room_code]:
                del self.active_connections[room_code][player_id]
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast_to_room(self, room_code: str, message: dict):
        if room_code in self.active_connections:
            disconnected = []
            for player_id, connection in self.active_connections[room_code].items():
                try:
                    await connection.send_json(message)
                except:
                    disconnected.append(player_id)
            for player_id in disconnected:
                self.disconnect(room_code, player_id)
    
    async def send_to_player(self, room_code: str, player_id: str, message: dict):
        """Send message to specific player"""
        if room_code in self.active_connections and player_id in self.active_connections[room_code]:
            try:
                await self.active_connections[room_code][player_id].send_json(message)
            except:
                self.disconnect(room_code, player_id)

manager = ConnectionManager()

# Models
class Player(BaseModel):
    id: str
    name: str
    is_host: bool = False
    score: int = 0
    warnings: int = 0

class CreateRoomRequest(BaseModel):
    player_name: str

class JoinRoomRequest(BaseModel):
    room_code: str
    player_name: str

class Room(BaseModel):
    code: str
    players: List[Player]
    host_id: str
    game_started: bool = False
    created_at: str

# Game state storage
game_states: Dict[str, Any] = {}
card_request_tasks: Dict[str, Any] = {}

def generate_room_code():
    return ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=6))

@api_router.post("/room/create")
async def create_room(request: CreateRoomRequest):
    room_code = generate_room_code()
    player_id = str(uuid.uuid4())
    
    player = Player(
        id=player_id,
        name=request.player_name,
        is_host=True,
        score=0
    )
    
    room = Room(
        code=room_code,
        players=[player],
        host_id=player_id,
        game_started=False,
        created_at=datetime.now(timezone.utc).isoformat()
    )
    
    await db.rooms.insert_one(room.model_dump())
    
    logger.info(f"Room created: {room_code} by {request.player_name}")
    
    return {"room_code": room_code, "player_id": player_id, "player": player}

@api_router.post("/room/join")
async def join_room(request: JoinRoomRequest):
    room = await db.rooms.find_one({"code": request.room_code})
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room.get('game_started'):
        raise HTTPException(status_code=400, detail="Game already started")
    
    if len(room.get('players', [])) >= 10:
        raise HTTPException(status_code=400, detail="Room is full")
    
    player_id = str(uuid.uuid4())
    player = Player(
        id=player_id,
        name=request.player_name,
        is_host=False,
        score=0
    )
    
    await db.rooms.update_one(
        {"code": request.room_code},
        {"$push": {"players": player.model_dump()}}
    )
    
    await manager.broadcast_to_room(request.room_code, {
        "type": "player_joined",
        "player": player.model_dump()
    })
    
    logger.info(f"Player {request.player_name} joined room {request.room_code}")
    
    return {"room_code": request.room_code, "player_id": player_id, "player": player}

@api_router.get("/room/{room_code}")
async def get_room(room_code: str):
    room = await db.rooms.find_one({"code": room_code}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@app.websocket("/api/ws/{room_code}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str):
    await manager.connect(websocket, room_code, player_id)
    
    try:
        await websocket.send_json({"type": "connected", "player_id": player_id})
        
        if room_code in game_states:
            await broadcast_game_state(room_code)
        
        while True:
            data = await websocket.receive_json()
            action = data.get('action')
            
            if action == 'start_game':
                await start_game(room_code, player_id)
            elif action == 'kick_player':
                await kick_player(room_code, player_id, data.get('target_player_id'))
            elif action == 'draw_card':
                await draw_card(room_code, player_id, data.get('from_pile'))
            elif action == 'discard_card':
                await discard_card(room_code, player_id, data.get('card_id'))
            elif action == 'request_discard_card':
                await request_discard_card(room_code, player_id)
            elif action == 'respond_card_request':
                await respond_card_request(room_code, player_id, data.get('accept'))
            elif action == 'lay_down_melds':
                await lay_down_melds(room_code, player_id, data.get('melds'))
            elif action == 'lay_off_card':
                await lay_off_card(room_code, player_id, data.get('card_id'), data.get('target_player_id'), data.get('meld_index'), data.get('position'))
            elif action == 'reorder_hand':
                await reorder_hand(room_code, player_id, data.get('card_order'))
            elif action == 'replace_joker':
                await replace_joker(room_code, player_id, data.get('card_id'), data.get('target_player_id'), data.get('meld_index'), data.get('joker_index'), data.get('new_joker_position'))
            elif action == 'continue_to_next_round':  # NUEVO
                await continue_to_next_round(room_code, player_id)
                
    except WebSocketDisconnect:
        manager.disconnect(room_code, player_id)
        await handle_player_disconnect(room_code, player_id)
    except Exception as e:
        logger.error(f"WebSocket error for player {player_id} in room {room_code}: {str(e)}")
        manager.disconnect(room_code, player_id)
        await handle_player_disconnect(room_code, player_id)

async def start_game(room_code: str, player_id: str):
    room = await db.rooms.find_one({"code": room_code})
    
    if not room or room['host_id'] != player_id:
        return
    
    if len(room['players']) < 2:
        await manager.broadcast_to_room(room_code, {
            "type": "error",
            "message": "Se necesitan al menos 2 jugadores"
        })
        return
    
    await db.rooms.update_one(
        {"code": room_code},
        {"$set": {"game_started": True}}
    )
    
    num_decks = get_num_decks(len(room['players']))
    deck = create_deck(num_decks)
    
    initial_cards = ROUND_REQUIREMENTS[1]['cards']
    player_hands = {}
    
    for player in room['players']:
        player_hands[player['id']] = [deck.pop() for _ in range(initial_cards)]
    
    discard_pile = [deck.pop()]
    
    game_state = {
        'round': 1,
        'deck': deck,
        'discard_pile': discard_pile,
        'player_hands': player_hands,
        'player_melds': {player['id']: [] for player in room['players']},
        'players': room['players'],
        'players_laid_down': set(),
        'current_player_index': 0,
        'turn_phase': 'draw',
        'has_drawn': False,
        'waiting_for_requests': False,
        'card_requests': [],
        'wait_end_time': None,
        'game_over': False,
        'turn_started_with_empty_hand': {},
        'first_draw_of_round': True,
        'players_who_went_out_in_one_turn': set(),
        'round_ended': False,
        'round_winner_name': None,
        'players_who_got_discard_card': set(),  # NUEVO
    }
    
    game_states[room_code] = game_state
    
    await manager.broadcast_to_room(room_code, {
        "type": "game_started",
        "message": "¡Juego iniciado!"
    })
    
    await broadcast_game_state(room_code)

async def kick_player(room_code: str, kicker_id: str, target_player_id: str):
    room = await db.rooms.find_one({"code": room_code})
    
    if not room or room['host_id'] != kicker_id:
        return
    
    if target_player_id == kicker_id:
        return
    
    await db.rooms.update_one(
        {"code": room_code},
        {"$pull": {"players": {"id": target_player_id}}}
    )
    
    await manager.broadcast_to_room(room_code, {
        "type": "player_kicked",
        "player_id": target_player_id
    })

async def draw_card(room_code: str, player_id: str, from_pile: str):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    current_player = game_state['players'][game_state['current_player_index']]
    
    if current_player['id'] != player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No es tu turno"
        })
        return
    
    # Si el jugador ya obtuvo carta del descarte, no puede robar
    if player_id in game_state.get('players_who_got_discard_card', set()):
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Ya obtuviste carta del descarte, no necesitas robar"
        })
        return
    
    if game_state['turn_phase'] != 'draw':
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Ya has robado una carta este turno"
        })
        return
    
    if game_state['has_drawn']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Ya has robado una carta este turno"
        })
        return
    
    hand = game_state['player_hands'][player_id]
    
    # Check if this is the first draw of the round
    is_first_draw = game_state.get('first_draw_of_round', False)
    
    if from_pile == 'deck':
        if not game_state['deck']:
            await manager.send_to_player(room_code, player_id, {
                "type": "error",
                "message": "El mazo está vacío"
            })
            return
        
        card = game_state['deck'].pop()
        hand.append(card)
        game_state['has_drawn'] = True
        game_state['turn_phase'] = 'action'
        
        await manager.broadcast_to_room(room_code, {
            "type": "notification",
            "message": f"{current_player['name']} robó del mazo"
        })
        
        # CRÍTICO: Si es first draw, procesar solicitudes AHORA
        if is_first_draw:
            await process_first_draw_requests(room_code, player_drew_from_discard=False)
        
    elif from_pile == 'discard':
        if not game_state['discard_pile']:
            await manager.send_to_player(room_code, player_id, {
                "type": "error",
                "message": "La pila de descarte está vacía"
            })
            return
        
        # IMPORTANTE: Si es first_draw y el jugador con turno roba del descarte,
        # obtiene la carta SIN penalización y cancela todas las solicitudes
        if is_first_draw:
            card = game_state['discard_pile'].pop()
            hand.append(card)
            game_state['has_drawn'] = True
            game_state['turn_phase'] = 'action'
            
            # Cancelar todas las solicitudes y marcar first_draw como procesado
            await process_first_draw_requests(room_code, player_drew_from_discard=True)
            
            await manager.broadcast_to_room(room_code, {
                "type": "notification",
                "message": f"{current_player['name']} robó del descarte (sin penalización)"
            })
        else:
            # Robo normal del descarte (en turno normal)
            card = game_state['discard_pile'].pop()
            hand.append(card)
            game_state['has_drawn'] = True
            game_state['turn_phase'] = 'action'
            
            await manager.broadcast_to_room(room_code, {
                "type": "notification",
                "message": f"{current_player['name']} robó del descarte"
            })
    
    await broadcast_game_state(room_code)

def get_card_value(card):
    """
    Retorna el valor en puntos de una carta.
    """
    if card.get('is_joker') or card.get('suit') == 'JOKER':
        return 50
    
    rank = card.get('rank', '')
    
    if rank in ['J', 'Q', 'K']:
        return 10
    elif rank == 'A':
        return 20
    else:
        # Cartas numéricas (2-10)
        try:
            return int(rank)
        except:
            return 0

async def handle_player_out(room_code: str, player_id: str):
    """
    Maneja cuando un jugador se queda sin cartas (termina la ronda).
    """
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    player = next((p for p in game_state['players'] if p['id'] == player_id), None)
    if not player:
        return
    
    player_name = player['name']
    current_round = game_state['round']
    
    # Verificar si el jugador bajó en un solo turno
    went_out_in_one_turn = player_id in game_state.get('players_who_went_out_in_one_turn', set())
    
    if went_out_in_one_turn:
        # Penalización: -10 puntos por ronda
        penalty = -10 * current_round
        player['score'] += penalty
        
        await manager.broadcast_to_room(room_code, {
            "type": "notification",
            "message": f"{player_name} terminó la ronda bajando todo en un turno! ({penalty} puntos)"
        })
    else:
        await manager.broadcast_to_room(room_code, {
            "type": "notification",
            "message": f"{player_name} terminó la ronda!"
        })
    
    # Calcular puntos para los demás jugadores
    for other_player in game_state['players']:
        if other_player['id'] != player_id:
            hand = game_state['player_hands'][other_player['id']]
            points = sum(get_card_value(card) for card in hand)
            other_player['score'] += points
    
    # Marcar ronda como terminada
    game_state['round_ended'] = True
    game_state['round_winner_name'] = player_name
    
    # Verificar si es la última ronda (ronda 7)
    if current_round >= 7:
        game_state['game_over'] = True
        await manager.broadcast_to_room(room_code, {
            "type": "notification",
            "message": "¡Juego terminado!"
        })
    
    await broadcast_game_state(room_code)

async def discard_card(room_code: str, player_id: str, card_id: str):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    current_player = game_state['players'][game_state['current_player_index']]
    
    if current_player['id'] != player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No es tu turno"
        })
        return
    
    if not game_state['has_drawn']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Debes robar una carta primero"
        })
        return
    
    hand = game_state['player_hands'][player_id]
    card = next((c for c in hand if c['id'] == card_id), None)
    
    if not card:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No tienes esa carta"
        })
        return
    
    # Remover carta de la mano y añadir al descarte
    hand.remove(card)
    game_state['discard_pile'].append(card)
    
    await manager.broadcast_to_room(room_code, {
        "type": "notification",
        "message": f"{current_player['name']} descartó"
    })
    
    # Check if player went out
    if len(hand) == 0:
        await handle_player_out(room_code, player_id)
        return
    
    # CRÍTICO: Iniciar período de espera INMEDIATAMENTE
    game_state['waiting_for_requests'] = True
    game_state['card_requests'] = []
    game_state['wait_end_time'] = time.time() + 5
    
    # Broadcast AHORA para que la carta aparezca en descarte
    await broadcast_game_state(room_code)
    
    # CRÍTICO: Usar create_task para no bloquear
    async def wait_and_process():
        await asyncio.sleep(5)
        
        # Verificar que el juego sigue activo
        current_game_state = game_states.get(room_code)
        if not current_game_state or current_game_state.get('round_ended'):
            return
        
        # Procesar solicitudes y pasar al siguiente turno
        await process_card_requests(room_code)
    
    # Iniciar tarea en background
    asyncio.create_task(wait_and_process())

async def continue_to_next_round(room_code: str, player_id: str):
    """Host continues to next round after seeing scores"""
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    room = await db.rooms.find_one({"code": room_code})
    if not room or room['host_id'] != player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Solo el anfitrión puede continuar"
        })
        return
    
    if not game_state.get('round_ended'):
        return
    
    # Clear round ended state
    game_state['round_ended'] = False
    game_state['round_winner_name'] = None
    
    # Advance to next round
    game_state['round'] += 1
    await setup_new_round(room_code)

async def handle_card_request_timeout(room_code: str):
    try:
        await asyncio.sleep(5)
        await process_card_requests(room_code)
    except asyncio.CancelledError:
        pass

async def request_discard_card(room_code: str, player_id: str):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    # Permitir solicitudes durante wait period O durante first draw
    is_first_draw = game_state.get('first_draw_of_round', False)
    is_waiting = game_state.get('waiting_for_requests', False)
    
    if not is_waiting and not is_first_draw:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No hay período de espera activo"
        })
        return
    
    # Verificar que hay carta para solicitar
    if not game_state['discard_pile']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No hay carta en el descarte para solicitar"
        })
        return
    
    current_player_id = game_state['players'][game_state['current_player_index']]['id']
    
    # Durante first draw, jugador con turno NO puede solicitar (roba directo sin penalización)
    if is_first_draw and player_id == current_player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Es tu turno, roba la carta directamente"
        })
        return
    
    # Durante wait period normal, jugador actual (que descartó) no puede solicitar
    if is_waiting and player_id == current_player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No puedes solicitar tu propia carta"
        })
        return
    
    # No permitir solicitudes duplicadas
    if player_id in game_state['card_requests']:
        return
    
    game_state['card_requests'].append(player_id)
    player_name = next(p['name'] for p in game_state['players'] if p['id'] == player_id)
    
    await manager.broadcast_to_room(room_code, {
        "type": "notification",
        "message": f"{player_name} solicitó la carta del descarte"
    })
    
    await broadcast_game_state(room_code)

async def respond_card_request(room_code: str, player_id: str, accept: bool):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    current_player_id = game_state['players'][game_state['current_player_index']]['id']
    
    # Implementation would require showing popup to current player

async def process_card_requests(room_code: str):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    game_state['waiting_for_requests'] = False
    game_state['wait_end_time'] = None
    
    # Calcular quién es el siguiente turno
    next_player_index = (game_state['current_player_index'] + 1) % len(game_state['players'])
    next_player_id = game_state['players'][next_player_index]['id']
    
    # Si hay solicitudes y hay carta en descarte
    if game_state['card_requests'] and game_state['discard_pile']:
        closest_player_id = find_closest_next_player(
            game_state['current_player_index'],
            game_state['card_requests'],
            game_state['players']
        )
        
        if closest_player_id:
            # Dar la carta del descarte SIEMPRE
            card = game_state['discard_pile'].pop()
            game_state['player_hands'][closest_player_id].append(card)
            
            player_name = next(p['name'] for p in game_state['players'] if p['id'] == closest_player_id)
            
            # RESTO DE TURNOS: Depende de si es el siguiente
            if closest_player_id == next_player_id:
                # ES el siguiente turno: SIN penalización, SALTA robo
                await manager.broadcast_to_room(room_code, {
                    "type": "notification",
                    "message": f"{player_name} obtuvo la carta solicitada (sin penalización - es su turno)"
                })
                
                # SÍ marcar para saltar robo
                if 'players_who_got_discard_card' not in game_state:
                    game_state['players_who_got_discard_card'] = set()
                game_state['players_who_got_discard_card'].add(closest_player_id)
                
            else:
                # NO es el siguiente turno: CON penalización, ROBA NORMAL
                if game_state['deck']:
                    penalty_card = game_state['deck'].pop()
                    game_state['player_hands'][closest_player_id].append(penalty_card)
                
                await manager.broadcast_to_room(room_code, {
                    "type": "notification",
                    "message": f"{player_name} obtuvo la carta solicitada + 1 carta de penalización"
                })
                
                # NO marcar - jugará normal con robo
    
    # Limpiar solicitudes
    game_state['card_requests'] = []
    
    # Pasar al siguiente turno
    game_state['current_player_index'] = next_player_index
    
    # Verificar si el siguiente jugador ya robó del descarte
    if next_player_id in game_state.get('players_who_got_discard_card', set()):
        # Este jugador obtuvo la carta en su turno inmediato, salta robo
        game_state['turn_phase'] = 'action'
        game_state['has_drawn'] = True
        game_state['players_who_got_discard_card'].discard(next_player_id)
    else:
        # Turno normal - debe robar
        game_state['turn_phase'] = 'draw'
        game_state['has_drawn'] = False
    
    await broadcast_game_state(room_code)

async def process_first_draw_requests(room_code: str, player_drew_from_discard: bool):
    """
    Procesa solicitudes al inicio de la ronda.
    Si el jugador con turno robó del descarte, cancela solicitudes.
    Si robó del mazo, asigna carta al solicitante más cercano.
    """
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    game_state['first_draw_of_round'] = False
    
    # Si el jugador con turno robó del descarte, cancelar solicitudes
    if player_drew_from_discard:
        game_state['card_requests'] = []
        await manager.broadcast_to_room(room_code, {
            "type": "notification",
            "message": "Solicitudes canceladas: el jugador robó del descarte"
        })
        return
    
    # Si el jugador robó del mazo, procesar solicitudes
    if game_state['card_requests'] and game_state['discard_pile']:
        closest_player_id = find_closest_next_player(
            game_state['current_player_index'],
            game_state['card_requests'],
            game_state['players']
        )
        
        if closest_player_id:
            # Dar la carta del descarte SIEMPRE
            card = game_state['discard_pile'].pop()
            game_state['player_hands'][closest_player_id].append(card)
            
            # PRIMERA JUGADA: SIEMPRE dar penalización
            if game_state['deck']:
                penalty_card = game_state['deck'].pop()
                game_state['player_hands'][closest_player_id].append(penalty_card)
            
            player_name = next(p['name'] for p in game_state['players'] if p['id'] == closest_player_id)
            
            await manager.broadcast_to_room(room_code, {
                "type": "notification",
                "message": f"{player_name} obtuvo la carta inicial + 1 carta de penalización"
            })
            
            # NO marcar en players_who_got_discard_card
            # Este jugador deberá robar normalmente cuando le toque
    
    # Limpiar solicitudes
    game_state['card_requests'] = []
    
    await broadcast_game_state(room_code)

async def lay_down_melds(room_code: str, player_id: str, melds: List[Dict]):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    current_player = game_state['players'][game_state['current_player_index']]
    
    if current_player['id'] != player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No es tu turno"
        })
        return
    
    # CRITICAL: Must have drawn before laying down
    if not game_state['has_drawn']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Debes robar antes de bajar"
        })
        return
    
    if player_id in game_state['players_laid_down']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Ya has bajado tus combinaciones"
        })
        return
    
    hand = game_state['player_hands'][player_id]
    all_card_ids = []
    validated_melds = []

    # NUEVO: Trackear si no había bajado antes (para went_out_in_one_turn)
    had_not_laid_down_before = player_id not in game_state['players_laid_down']
    
    for meld in melds:
        meld_cards = [c for c in hand if c['id'] in meld['card_ids']]
        
        if len(meld_cards) != len(meld['card_ids']):
            await manager.send_to_player(room_code, player_id, {
                "type": "error",
                "message": "Algunas cartas no están en tu mano"
            })
            return
        
        if meld['type'] == 'set':
            valid, message = validate_set(meld_cards)
        else:
            valid, message = validate_run(meld_cards)
        
        if not valid:
            current_warnings = current_player.get('warnings', 0)
            current_player['warnings'] = current_warnings + 1
            
            await manager.send_to_player(room_code, player_id, {
                "type": "error",
                "message": f"Combinación inválida: {message}. Advertencias: {current_player['warnings']}"
            })
            
            if current_player['warnings'] >= 2:
                if game_state['deck']:
                    penalty_card = game_state['deck'].pop()
                    hand.append(penalty_card)
                    await manager.send_to_player(room_code, player_id, {
                        "type": "notification",
                        "message": "2 advertencias: carta de penalización añadida"
                    })
                current_player['warnings'] = 0
            
            await broadcast_game_state(room_code)
            return

        # NUEVO: Sortear runs para que Jokers estén en su posición
        if meld['type'] == 'run':
            from game_logic import sort_run_cards
            meld_cards = sort_run_cards(meld_cards)
        
        all_card_ids.extend(meld['card_ids'])
        validated_melds.append({
            'type': meld['type'],
            'cards': meld_cards  # Ya sorteados si es run
        })
    
    valid_group, group_message = validate_meld_group(validated_melds, game_state['round'])
    
    if not valid_group:
        current_warnings = current_player.get('warnings', 0)
        current_player['warnings'] = current_warnings + 1
        
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": f"{group_message}. Advertencias: {current_player['warnings']}"
        })
        
        if current_player['warnings'] >= 2:
            if game_state['deck']:
                penalty_card = game_state['deck'].pop()
                hand.append(penalty_card)
                await manager.send_to_player(room_code, player_id, {
                    "type": "notification",
                    "message": "2 advertencias: carta de penalización añadida"
                })
            current_player['warnings'] = 0
        
        await broadcast_game_state(room_code)
        return
    
    for card_id in all_card_ids:
        card = next(c for c in hand if c['id'] == card_id)
        hand.remove(card)
    
    game_state['player_melds'][player_id] = validated_melds
    game_state['players_laid_down'].add(player_id)

    # NUEVO: Si no había bajado antes y ahora sí, marcar potencial went_out_in_one_turn
    if had_not_laid_down_before:
        game_state['players_who_went_out_in_one_turn'].add(player_id)
    
    await manager.broadcast_to_room(room_code, {
        "type": "notification",
        "message": f"{current_player['name']} bajó sus combinaciones"
    })
    
    # Check if player has 0 cards after laying down
    if len(hand) == 0:
        went_out_in_one_turn = player_id in game_state.get('players_who_went_out_in_one_turn', set())
        await end_round(room_code, player_id, went_out_in_one_turn)
        return
    
    # After successful lay down, player MUST discard
    await manager.send_to_player(room_code, player_id, {
        "type": "notification",
        "message": "Ahora debes descartar una carta para finalizar tu turno"
    })
    
    await broadcast_game_state(room_code)

async def lay_off_card(room_code: str, player_id: str, card_id: str, target_player_id: str, meld_index: int, position: Optional[int] = None):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    current_player = game_state['players'][game_state['current_player_index']]
    
    if current_player['id'] != player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No es tu turno"
        })
        return
    
    # Must have drawn first
    if not game_state['has_drawn']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Debes robar primero"
        })
        return
    
    # Must have laid down own melds
    if player_id not in game_state['players_laid_down']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Debes bajar tus combinaciones primero"
        })
        return
    
    # Target player must have laid down
    if target_player_id not in game_state['players_laid_down']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "El jugador objetivo no ha bajado combinaciones"
        })
        return
    
    hand = game_state['player_hands'][player_id]
    card = next((c for c in hand if c['id'] == card_id), None)
    
    if not card:
        return
    
    target_melds = game_state['player_melds'].get(target_player_id, [])
    if meld_index >= len(target_melds):
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Combinación no encontrada"
        })
        return
    
    target_meld = target_melds[meld_index]
    
    # Create test combination with card at specific position
    test_cards = target_meld['cards'].copy()
    if position is not None and target_meld['type'] == 'run':
        test_cards.insert(position, card)
    else:
        test_cards.append(card)
    
    if target_meld['type'] == 'set':
        valid, message = validate_set(test_cards)
    else:
        valid, message = validate_run(test_cards)
    
    if not valid:
        current_warnings = current_player.get('warnings', 0)
        current_player['warnings'] = current_warnings + 1
        
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": f"No puedes agregar esa carta: {message}. Advertencias: {current_player['warnings']}"
        })
        
        if current_player['warnings'] >= 2:
            if game_state['deck']:
                penalty_card = game_state['deck'].pop()
                hand.append(penalty_card)
                await manager.send_to_player(room_code, player_id, {
                    "type": "notification",
                    "message": "2 advertencias: carta de penalización añadida"
                })
            current_player['warnings'] = 0
        
        await broadcast_game_state(room_code)
        return
    
    # Add card to meld
    if position is not None and target_meld['type'] == 'run':
        target_meld['cards'].insert(position, card)
    else:
        target_meld['cards'].append(card)
    
    hand.remove(card)
    
    target_player_name = next(p['name'] for p in game_state['players'] if p['id'] == target_player_id)
    
    await manager.broadcast_to_room(room_code, {
        "type": "notification",
        "message": f"{current_player['name']} colocó una carta en la combinación de {target_player_name}"
    })
    
    # Check if player has 0 cards
    if len(hand) == 0:
        went_out_in_one_turn = False
        await end_round(room_code, player_id, went_out_in_one_turn)
        return
    
    await broadcast_game_state(room_code)

async def replace_joker(room_code: str, player_id: str, card_id: str, target_player_id: str, meld_index: int, joker_index: int, new_joker_position: int):
    """Replace a joker in another player's meld with a natural card"""
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    current_player = game_state['players'][game_state['current_player_index']]
    
    if current_player['id'] != player_id:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "No es tu turno"
        })
        return
    
    if not game_state['has_drawn']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Debes robar primero"
        })
        return
    
    if player_id not in game_state['players_laid_down']:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Debes bajar tus combinaciones primero"
        })
        return
    
    hand = game_state['player_hands'][player_id]
    card = next((c for c in hand if c['id'] == card_id), None)
    
    if not card or card.get('is_joker'):
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "Carta inválida para reemplazar joker"
        })
        return
    
    target_melds = game_state['player_melds'].get(target_player_id, [])
    if meld_index >= len(target_melds):
        return
    
    target_meld = target_melds[meld_index]
    
    if joker_index >= len(target_meld['cards']):
        return
    
    joker = target_meld['cards'][joker_index]
    if not joker.get('is_joker'):
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": "La carta seleccionada no es un joker"
        })
        return
    
    # Test replacement
    test_cards = target_meld['cards'].copy()
    test_cards[joker_index] = card
    
    if target_meld['type'] == 'set':
        valid, message = validate_set(test_cards)
    else:
        valid, message = validate_run(test_cards)
    
    if not valid:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": f"Reemplazo inválido: {message}"
        })
        return
    
    # Now test placing the joker in new position
    test_cards_with_joker = test_cards.copy()
    test_cards_with_joker.insert(new_joker_position, joker)
    
    if target_meld['type'] == 'set':
        valid_with_joker, message2 = validate_set(test_cards_with_joker)
    else:
        valid_with_joker, message2 = validate_run(test_cards_with_joker)
    
    if not valid_with_joker:
        await manager.send_to_player(room_code, player_id, {
            "type": "error",
            "message": f"No se puede colocar el joker ahí: {message2}"
        })
        return
    
    # Perform replacement
    target_meld['cards'][joker_index] = card
    target_meld['cards'].insert(new_joker_position, joker)
    hand.remove(card)
    
    await manager.broadcast_to_room(room_code, {
        "type": "notification",
        "message": f"{current_player['name']} reemplazó un joker"
    })
    
    await broadcast_game_state(room_code)

async def reorder_hand(room_code: str, player_id: str, card_order: List[str]):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    hand = game_state['player_hands'].get(player_id, [])
    
    if set(c['id'] for c in hand) != set(card_order):
        return
    
    new_hand = []
    for card_id in card_order:
        card = next(c for c in hand if c['id'] == card_id)
        new_hand.append(card)
    
    game_state['player_hands'][player_id] = new_hand
    await broadcast_game_state(room_code)

async def end_round(room_code: str, winner_id: str, went_out_in_one_turn: bool):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    winner_name = next(p['name'] for p in game_state['players'] if p['id'] == winner_id)
    
    # Calculate points
    for player in game_state['players']:
        if player['id'] == winner_id:
            if went_out_in_one_turn:
                negative_points = calculate_negative_points(game_state['round'])
                player['score'] += negative_points  # Ya es negativo
                await manager.broadcast_to_room(room_code, {
                    "type": "notification",
                    "message": f"¡{winner_name} se bajó en un turno! {negative_points} puntos"
                })
        else:
            hand = game_state['player_hands'][player['id']]
            points = calculate_hand_points(hand)
            player['score'] += points
    
    await db.rooms.update_one(
        {"code": room_code},
        {"$set": {"players": game_state['players']}}
    )
    
    if game_state['round'] >= 7:
        game_state['game_over'] = True
        await broadcast_game_state(room_code)
        
        sorted_players = sorted(game_state['players'], key=lambda p: p['score'])
        final_winner = sorted_players[0]
        await manager.broadcast_to_room(room_code, {
            "type": "notification",
            "message": f"¡Juego terminado! Ganador: {final_winner['name']} con {final_winner['score']} puntos"
        })
    else:
        # NUEVO: En lugar de avanzar automáticamente, mostrar pantalla intermedia
        game_state['round_ended'] = True
        game_state['round_winner_name'] = winner_name
        
        await manager.broadcast_to_room(room_code, {
            "type": "round_ended",
            "winner": winner_name,
            "message": f"Ronda {game_state['round']} terminada. {winner_name} ganó!"
        })
        
        await broadcast_game_state(room_code)
        # NO llamar a setup_new_round() automáticamente

async def setup_new_round(room_code: str):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    num_decks = get_num_decks(len(game_state['players']))
    deck = create_deck(num_decks)
    initial_cards = ROUND_REQUIREMENTS[game_state['round']]['cards']
    
    player_hands = {}
    for player in game_state['players']:
        player_hands[player['id']] = [deck.pop() for _ in range(initial_cards)]
    
    discard_pile = [deck.pop()]
    
    game_state['deck'] = deck
    game_state['discard_pile'] = discard_pile
    game_state['player_hands'] = player_hands
    game_state['player_melds'] = {player['id']: [] for player in game_state['players']}
    game_state['players_laid_down'] = set()
    game_state['current_player_index'] = 0
    game_state['turn_phase'] = 'draw'
    game_state['has_drawn'] = False
    game_state['waiting_for_requests'] = False
    game_state['card_requests'] = []
    game_state['wait_end_time'] = None
    game_state['turn_started_with_empty_hand'] = {}
    game_state['first_draw_of_round'] = True
    game_state['players_who_went_out_in_one_turn'] = set()
    game_state['players_who_got_discard_card'] = set()
    
    for player in game_state['players']:
        player['warnings'] = 0
    
    await manager.broadcast_to_room(room_code, {
        "type": "notification",
        "message": f"¡Ronda {game_state['round']} iniciada!"
    })
    
    await broadcast_game_state(room_code)

async def broadcast_game_state(room_code: str):
    game_state = game_states.get(room_code)
    if not game_state:
        return
    
    round_req = ROUND_REQUIREMENTS[game_state['round']]
    
    for player in game_state['players']:
        player_view = {
            'type': 'game_state',
            'round': game_state['round'],
            'round_requirements': round_req,
            'current_player_id': game_state['players'][game_state['current_player_index']]['id'],
            'turn_phase': game_state['turn_phase'],
            'has_drawn': game_state['has_drawn'],
            'deck_count': len(game_state['deck']),
            'discard_pile_top': game_state['discard_pile'][-1] if game_state['discard_pile'] else None,
            'my_hand': game_state['player_hands'][player['id']],
            'has_laid_down': player['id'] in game_state['players_laid_down'],
            'waiting_for_requests': game_state.get('waiting_for_requests', False),
            'card_requests': game_state.get('card_requests', []),
            'wait_end_time': game_state.get('wait_end_time'),
            'first_draw_of_round': game_state.get('first_draw_of_round', False),  # IMPORTANTE
            'round_ended': game_state.get('round_ended', False),
            'round_winner_name': game_state.get('round_winner_name'),
            'players': [{
                'id': p['id'],
                'name': p['name'],
                'score': p['score'],
                'warnings': p.get('warnings', 0),
                'hand_count': len(game_state['player_hands'][p['id']]),
                'melds': game_state['player_melds'][p['id']],
                'has_laid_down': p['id'] in game_state['players_laid_down']
            } for p in game_state['players']],
            'game_over': game_state.get('game_over', False)
        }
        
        if player['id'] in manager.active_connections.get(room_code, {}):
            try:
                await manager.active_connections[room_code][player['id']].send_json(player_view)
            except:
                pass

async def handle_player_disconnect(room_code: str, player_id: str):
    room = await db.rooms.find_one({"code": room_code})
    if not room:
        return
    
    await manager.broadcast_to_room(room_code, {
        "type": "player_disconnected",
        "player_id": player_id
    })

# Include the router in the main app
app.include_router(api_router)

# CORS middleware
cors_origins = os.environ.get('CORS_ORIGINS', '').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,  # Ahora dinámico
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)