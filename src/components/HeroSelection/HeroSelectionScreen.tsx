import React, { useEffect, useMemo, useState } from 'react';
import { HERO_LIST, Hero } from '../../data/heroList';

interface Props {
  onLockIn: (hero: Hero) => void;
}

export const HeroSelectionScreen: React.FC<Props> = ({ onLockIn }) => {
  const [filter, setFilter] = useState<'all' | 'str' | 'agi' | 'int'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Hero | null>(null);
  const [time, setTime] = useState(60);

  useEffect(() => {
    const t = setInterval(() => setTime((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const heroes = useMemo(
    () =>
      HERO_LIST.filter(
        (h) => filter === 'all' || h.attribute === filter,
      ),
    [filter],
  );

  return (
    <div className="w-screen h-screen bg-[#0f1012] text-white flex p-6">
      <div className="flex-1">
        <div className="flex justify-between mb-4 font-cinzel tracking-widest">
          <div>PICK YOUR HERO</div>
          <div className="text-3xl font-bold">{time}</div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setFilter('str')} className="text-red-400">STR</button>
          <button onClick={() => setFilter('agi')} className="text-green-400">AGI</button>
          <button onClick={() => setFilter('int')} className="text-blue-400">INT</button>
          <button onClick={() => setFilter('all')}>ALL</button>
        </div>

        <div className="grid grid-cols-8 gap-2">
          {heroes.map((h) => (
            <div
              key={h.id}
              onClick={() => setSelected(h)}
              className="cursor-pointer border border-white/10 hover:brightness-125"
            >
              <img src={h.image} alt={h.name} />
            </div>
          ))}
        </div>
      </div>

      <div className="w-[30%] bg-black/40 p-4">
        {selected && (
          <>
            <img src={selected.image} className="w-full mb-4" />
            <h2 className="font-cinzel text-xl">{selected.name}</h2>
            <p className="italic text-sm opacity-70 mb-2">{selected.lore}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>DMG: {selected.stats.damage}</div>
              <div>ARM: {selected.stats.armor}</div>
              <div>SPD: {selected.stats.speed}</div>
            </div>
            <button
              onClick={() => selected && onLockIn(selected)}
              className="mt-4 w-full bg-red-700 hover:bg-red-600 py-2"
            >
              LOCK IN
            </button>
          </>
        )}
      </div>
    </div>
  );
};
