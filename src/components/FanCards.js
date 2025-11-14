import React, { useState } from 'react';
import Card from './Card';

export const FanCards = ({ cards, meldType, expanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(expanded);

  if (!cards || cards.length === 0) return null;

  // For mobile, show collapsed fan by default
  if (!isExpanded) {
    return (
      <div
        className="fan-cards-container"
        onClick={() => setIsExpanded(true)}
      >
        {cards.map((card, index) => (
          <div
            key={card.id}
            className="fan-card"
            style={{
              left: `${index * 12}px`,
              zIndex: index,
            }}
          >
            <div className="fan-card-mini">
              <span className={`fan-card-rank ${
                (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900'
              }`}>
                {card.rank}
              </span>
              <span className={`fan-card-suit ${
                (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900'
              }`}>
                {card.suit}
              </span>
            </div>
          </div>
        ))}
        <div className="fan-card-label">
          {meldType === 'set' ? 'Trío' : 'Escalera'} ({cards.length})
        </div>
      </div>
    );
  }

  // Expanded view shows all cards normally
  return (
    <div className="expanded-meld" onClick={() => setIsExpanded(false)}>
      <div className="flex flex-wrap gap-1">
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            style={{ width: '50px', height: '70px' }}
          />
        ))}
      </div>
      <div className="text-xs text-white/60 mt-1 text-center">
        Toca para contraer
      </div>
    </div>
  );
};

export default FanCards;
