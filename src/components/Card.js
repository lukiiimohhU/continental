import React from 'react';

export const Card = ({ card, selected, onClick, className = '', style = {} }) => {
  const getCardColor = () => {
    if (card.suit === 'JOKER' || card.is_joker) return 'card-joker';
    return (card.suit === '♥' || card.suit === '♦') ? 'card-red' : 'card-black';
  };

  const renderCardContent = () => {
    if (card.suit === 'JOKER' || card.is_joker) {
      // Determine font size based on card size
      const width = style.width ? parseInt(style.width) : 80;
      const topBottomSize = width < 60 ? '0.4rem' : width < 70 ? '0.5rem' : '0.6rem';
      const iconSize = width < 60 ? '1.5rem' : width < 70 ? '2rem' : '2.5rem';
      
      return (
        <div className="flex flex-col items-center justify-center h-full px-1">
          <div 
            className="card-joker-text font-bold" 
            style={{ 
              fontSize: topBottomSize,
              letterSpacing: '0.3px',
              lineHeight: '1'
            }}
          >
            JOKER
          </div>
          <div 
            className="card-joker-icon my-1" 
            style={{ fontSize: iconSize }}
          >
            🃏
          </div>
          <div 
            className="card-joker-text font-bold" 
            style={{ 
              fontSize: topBottomSize,
              letterSpacing: '0.3px',
              lineHeight: '1'
            }}
          >
            JOKER
          </div>
        </div>
      );
    }

    return (
      <>
        <span className="card-rank">{card.rank}</span>
        <div className="card-suit-container">
          <span className="card-suit">{card.suit}</span>
        </div>
        <span className="card-rank-bottom">{card.rank}</span>
      </>
    );
  };

  return (
    <div
      onClick={onClick}
      className={`card-element ${getCardColor()} ${selected ? 'selected' : ''} ${className}`}
      style={style}
    >
      {renderCardContent()}
    </div>
  );
};

export default Card;