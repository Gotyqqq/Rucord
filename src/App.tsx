import React, { useState } from 'react';
import { HeroSelectionScreen } from './components/HeroSelection/HeroSelectionScreen';
import { GameScreen } from './components/Game/GameScreen';
import { Hero } from './data/heroList';

export const App: React.FC = () => {
  const [selectedHero, setSelectedHero] = useState<Hero | null>(null);

  return (
    <>
      {!selectedHero && (
        <HeroSelectionScreen onLockIn={(hero) => setSelectedHero(hero)} />
      )}
      {selectedHero && <GameScreen hero={selectedHero} />}
    </>
  );
};

export default App;
