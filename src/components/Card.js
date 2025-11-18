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
      // Better scaling for small cards (40px, 45px, 50px)
      const topBottomSize = width <= 40 ? '0.3rem' : width <= 45 ? '0.33rem' : width <= 50 ? '0.35rem' : width < 60 ? '0.4rem' : width < 70 ? '0.5rem' : '0.6rem';
      const iconSize = width <= 40 ? '1rem' : width <= 45 ? '1.1rem' : width <= 50 ? '1.2rem' : width < 60 ? '1.5rem' : width < 70 ? '2rem' : '2.5rem';
      const verticalPadding = width <= 40 ? '1px' : width <= 50 ? '2px' : '4px';
      const emojiMargin = width <= 40 ? '2px' : width <= 50 ? '3px' : '4px';

      return (
        <div className="flex flex-col items-center justify-center h-full" style={{ padding: `${verticalPadding} 2px` }}>
          <div
            className="card-joker-text font-bold"
            style={{
              fontSize: topBottomSize,
              letterSpacing: width <= 50 ? '0.1px' : '0.3px',
              lineHeight: '1',
              marginBottom: width <= 50 ? '1px' : '2px'
            }}
          >
            JOKER
          </div>
          <div
            className="card-joker-icon"
            style={{
              fontSize: iconSize,
              lineHeight: '1',
              margin: `${emojiMargin} 0`
            }}
          >
            🃏
          </div>
          <div
            className="card-joker-text font-bold"
            style={{
              fontSize: topBottomSize,
              letterSpacing: width <= 50 ? '0.1px' : '0.3px',
              lineHeight: '1',
              marginTop: width <= 50 ? '1px' : '2px'
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