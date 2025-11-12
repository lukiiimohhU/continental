import React from 'react';

export const Card = ({ card, selected, onClick, className = '', style = {} }) => {
  const getCardColor = () => {
    if (card.suit === 'JOKER' || card.is_joker) return 'card-joker';
    return (card.suit === '♥' || card.suit === '♦') ? 'card-red' : 'card-black';
  };

  const renderCardContent = () => {
    // Determine font sizes based on card width for consistent scaling
    const width = style.width ? parseInt(style.width) : 80;
    const rankSize = width < 60 ? '0.7rem' : width < 70 ? '0.9rem' : '1.2rem';
    const suitSize = width < 60 ? '1.2rem' : width < 70 ? '1.5rem' : '2rem';

    if (card.suit === 'JOKER' || card.is_joker) {
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
        <span className="card-rank" style={{ fontSize: rankSize }}>{card.rank}</span>
        <div className="card-suit-container">
          <span className="card-suit" style={{ fontSize: suitSize }}>{card.suit}</span>
        </div>
        <span className="card-rank-bottom" style={{ fontSize: rankSize }}>{card.rank}</span>
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