import React, { useState } from 'react';
import Card from './Card';

export const FanCards = ({ cards, meldType, expanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(expanded);

  if (!cards || cards.length === 0) return null;

  // For mobile, show collapsed fan by default with real Card components
  if (!isExpanded) {
    const cardWidth = 50;
    const overlapAmount = 20; // Cards will overlap by this amount
    const containerWidth = cardWidth + (cards.length - 1) * overlapAmount;

    return (
      <div
        className="fan-cards-container-new"
        onClick={() => setIsExpanded(true)}
        style={{
          width: `${containerWidth}px`,
          height: '70px',
          position: 'relative',
          cursor: 'pointer',
          display: 'inline-block',
          marginBottom: '24px'
        }}
      >
        {cards.map((card, index) => (
          <div
            key={card.id}
            style={{
              position: 'absolute',
              left: `${index * overlapAmount}px`,
              top: 0,
              zIndex: index,
              transition: 'all 0.2s ease'
            }}
          >
            <Card
              card={card}
              style={{ width: '50px', height: '70px' }}
            />
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
            style={{ width: '60px', height: '84px' }}
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
