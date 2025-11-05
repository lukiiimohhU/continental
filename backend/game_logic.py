"""
Game Logic for Continental Card Game
Contains all game rules, validation, and card handling logic
"""
import random
import uuid
from typing import List, Dict, Optional, Tuple
from enum import Enum

class CardSuit(str, Enum):
    SPADES = '♠'
    HEARTS = '♥'
    DIAMONDS = '♦'
    CLUBS = '♣'
    JOKER = 'JOKER'

class CardRank(str, Enum):
    ACE = 'A'
    TWO = '2'
    THREE = '3'
    FOUR = '4'
    FIVE = '5'
    SIX = '6'
    SEVEN = '7'
    EIGHT = '8'
    NINE = '9'
    TEN = '10'
    JACK = 'J'
    QUEEN = 'Q'
    KING = 'K'
    JOKER = 'JOKER'

# Round requirements
ROUND_REQUIREMENTS = {
    1: {'cards': 7, 'sets': [3, 3], 'runs': []},
    2: {'cards': 8, 'sets': [3], 'runs': [4]},
    3: {'cards': 9, 'sets': [], 'runs': [4, 4]},
    4: {'cards': 10, 'sets': [3, 3, 3], 'runs': []},
    5: {'cards': 11, 'sets': [3, 3], 'runs': [4]},
    6: {'cards': 12, 'sets': [3], 'runs': [4, 4]},
    7: {'cards': 13, 'sets': [], 'runs': []},
}

def get_num_decks(num_players: int) -> int:
    if num_players <= 4:
        return 2
    elif num_players <= 7:
        return 3
    else:
        return 4

def create_deck(num_decks: int = 2) -> List[Dict]:
    deck = []
    suits = [CardSuit.SPADES, CardSuit.HEARTS, CardSuit.DIAMONDS, CardSuit.CLUBS]
    ranks = [CardRank.ACE, CardRank.TWO, CardRank.THREE, CardRank.FOUR, CardRank.FIVE,
             CardRank.SIX, CardRank.SEVEN, CardRank.EIGHT, CardRank.NINE, CardRank.TEN,
             CardRank.JACK, CardRank.QUEEN, CardRank.KING]
    
    for _ in range(num_decks):
        for suit in suits:
            for rank in ranks:
                deck.append({
                    'suit': suit.value,
                    'rank': rank.value,
                    'id': str(uuid.uuid4()),
                    'is_joker': False
                })
        for _ in range(2):
            deck.append({
                'suit': CardSuit.JOKER.value,
                'rank': CardRank.JOKER.value,
                'id': str(uuid.uuid4()),
                'is_joker': True
            })
    
    random.shuffle(deck)
    return deck

def get_card_value(card: Dict) -> int:
    rank = card['rank']
    if rank == 'JOKER':
        return 50
    elif rank == 'A':
        return 20
    elif rank in ['J', 'Q', 'K']:
        return 10
    else:
        return int(rank)

def get_rank_value(rank: str) -> int:
    rank_values = {
        'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
        '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
    }
    return rank_values.get(rank, 0)

def validate_set(cards: List[Dict]) -> Tuple[bool, str]:
    if len(cards) < 3:
        return False, "Un trío necesita al menos 3 cartas"
    
    jokers = [c for c in cards if c['is_joker']]
    normal_cards = [c for c in cards if not c['is_joker']]
    
    if len(jokers) >= len(normal_cards):
        return False, "Debe haber más cartas normales que Jokers"
    
    if len(normal_cards) == 0:
        return False, "No puede haber solo Jokers"
    
    ranks = [c['rank'] for c in normal_cards]
    if len(set(ranks)) > 1:
        return False, "Todas las cartas deben ser del mismo número"
    
    return True, "Trío válido"

def validate_run(cards: List[Dict]) -> Tuple[bool, str]:
    """Validate run with cyclic support (K-A-2-3)"""
    if len(cards) < 4:
        return False, "Una escalera necesita al menos 4 cartas"
    
    jokers = [c for c in cards if c['is_joker']]
    normal_cards = [c for c in cards if not c['is_joker']]
    
    if len(jokers) >= len(normal_cards):
        return False, "Debe haber más cartas normales que Jokers"
    
    if len(normal_cards) == 0:
        return False, "No puede haber solo Jokers"
    
    suits = [c['suit'] for c in normal_cards]
    if len(set(suits)) > 1:
        return False, "Todas las cartas deben ser del mismo palo"
    
    normal_values = sorted([get_rank_value(c['rank']) for c in normal_cards])
    total_length = len(cards)
    num_jokers = len(jokers)
    
    # Try non-cyclic first
    if try_sequence(normal_values, num_jokers, total_length, False):
        return True, "Escalera válida"
    
    # Try cyclic (K-A-2...)
    if try_sequence(normal_values, num_jokers, total_length, True):
        return True, "Escalera válida (cíclica)"
    
    return False, "Las cartas no forman una secuencia válida"

def try_sequence(values, num_jokers, total_length, cyclic):
    """Try to form a sequence with given values and jokers"""
    if len(values) == 0:
        return False
    
    # For cyclic, convert Ace to 14 if there are high cards
    if cyclic and 1 in values and any(v >= 11 for v in values):
        values_adjusted = []
        for v in values:
            if v == 1:
                values_adjusted.append(14)
            else:
                values_adjusted.append(v)
        values = sorted(values_adjusted)
    
    min_val = values[0]
    max_val = values[-1]
    span = max_val - min_val + 1
    
    if span != total_length:
        return False
    
    # Check gaps can be filled with jokers
    all_positions = set(range(min_val, max_val + 1))
    filled_positions = set(values)
    gaps = sorted(all_positions - filled_positions)
    
    if len(gaps) != num_jokers:
        return False
    
    # Check no consecutive jokers
    sequence = []
    for pos in range(min_val, max_val + 1):
        if pos in filled_positions:
            sequence.append('card')
        else:
            sequence.append('joker')
    
    for i in range(len(sequence) - 1):
        if sequence[i] == 'joker' and sequence[i + 1] == 'joker':
            return False
    
    return True

def validate_meld_group(melds: List[Dict], round_num: int) -> Tuple[bool, str]:
    requirements = ROUND_REQUIREMENTS[round_num]
    
    if round_num == 7:
        return True, "Ronda 7: debe bajar todas las cartas en un turno"
    
    sets = [m for m in melds if m['type'] == 'set']
    runs = [m for m in melds if m['type'] == 'run']
    
    required_sets = requirements['sets']
    required_runs = requirements['runs']
    
    if len(sets) < len(required_sets):
        return False, f"Faltan tríos: necesitas {len(required_sets)}, tienes {len(sets)}"
    
    if len(runs) < len(required_runs):
        return False, f"Faltan escaleras: necesitas {len(required_runs)}, tienes {len(runs)}"
    
    for i, required_size in enumerate(required_sets):
        if i >= len(sets):
            break
        if len(sets[i]['cards']) < required_size:
            return False, f"Trío {i+1} debe tener al menos {required_size} cartas"
    
    for i, required_size in enumerate(required_runs):
        if i >= len(runs):
            break
        if len(runs[i]['cards']) < required_size:
            return False, f"Escalera {i+1} debe tener al menos {required_size} cartas"
    
    return True, "Combinaciones válidas"

def calculate_hand_points(hand: List[Dict]) -> int:
    return sum(get_card_value(card) for card in hand)

def calculate_negative_points(round_num: int) -> int:
    return -10 * round_num

def sort_run_cards(cards: List[Dict]) -> List[Dict]:
    """Sort run cards maintaining joker positions"""
    normal_cards = [c for c in cards if not c['is_joker']]
    jokers = [c for c in cards if c['is_joker']]
    
    if not normal_cards:
        return cards
    
    normal_values = [get_rank_value(c['rank']) for c in normal_cards]
    
    # Check if cyclic
    has_high = any(v >= 11 for v in normal_values)
    has_ace = 1 in normal_values
    
    value_to_card = {}
    for card in normal_cards:
        val = get_rank_value(card['rank'])
        if has_high and val == 1:
            value_to_card[14] = card
        else:
            value_to_card[val] = card
    
    sorted_values = sorted(value_to_card.keys())
    
    result = []
    all_positions = list(range(sorted_values[0], sorted_values[-1] + 1))
    
    joker_idx = 0
    for pos in all_positions:
        if pos in value_to_card:
            result.append(value_to_card[pos])
        elif joker_idx < len(jokers):
            result.append(jokers[joker_idx])
            joker_idx += 1
    
    while joker_idx < len(jokers):
        result.append(jokers[joker_idx])
        joker_idx += 1
    
    return result