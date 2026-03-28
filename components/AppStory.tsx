
import React, { useState, useRef, useEffect } from 'react';
import { triggerHaptic } from '../services/haptics';

interface AppStoryProps {
  onBack: () => void;
}

const stories = [
  {
    id: 1,
    bg: "bg-slate-950",
    accent: "text-rose-500",
    icon: "🌏",
    title: " The Paradox",
    text: "We live in a world where 1/3 of all food produced is lost or wasted...",
    sub: "That's 1.3 billion tons every year."
  },
  {
    id: 2,
    bg: "bg-slate-900",
    accent: "text-amber-500",
    icon: "🥣",
    title: "The Reality",
    text: "...Yet, over 800 million people go to sleep hungry every single night.",
    sub: "It's not a lack of food. It's a disconnect."
  },
  {
    id: 3,
    bg: "bg-emerald-950",
    accent: "text-emerald-400",
    icon: "🌉",
    title: "The Bridge",
    text: "MEALers Connect was built to solve this logistics problem.",
    sub: "We connect those with surplus to those in need."
  },
  {
    id: 4,
    bg: "bg-blue-950",
    accent: "text-blue-400",
    icon: "🤝",
    title: "How It Works",
    text: "Donors post food. Volunteers pick it up. Communities get fed.",
    sub: "Verified. Tracked. Safe."
  },
  {
    id: 5,
    bg: "bg-indigo-950",
    accent: "text-indigo-400",
    icon: "✨",
    title: "Your Impact",
    text: "Every donation saves CO2 and fills a stomach.",
    sub: "Join the movement today.",
    isLast: true
  }
];

const AppStory: React.FC<AppStoryProps> = ({ onBack }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleScroll = () => {
    if (scrollRef.current) {
      const index = Math.round(scrollRef.current.scrollTop / window.innerHeight);
      if (index !== activeIndex) {
        setActiveIndex(index);
        triggerHaptic('selection');
      }
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!scrollRef.current) return;
        const h = window.innerHeight;
        
        if (e.key === 'ArrowDown' || e.key === ' ') {
            e.preventDefault();
            scrollRef.current.scrollBy({ top: h, behavior: 'smooth' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            scrollRef.current.scrollBy({ top: -h, behavior: 'smooth' });
        } else if (e.key === 'Escape') {
            onBack();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const handleMouseMove = (e: React.MouseEvent) => {
      const { clientX, clientY } = e;
      const x = (clientX / window.innerWidth - 0.5) * 40; 
      const y = (clientY / window.innerHeight - 0.5) * 40;
      setMousePos({ x, y });
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black text-white font-sans" onMouseMove={handleMouseMove}>
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 flex gap-1 p-2">
        {stories.map((_, idx) => (
          <div 
            key={idx} 
            className={`h-1 flex-1 rounded-full transition-all duration-700 ${idx <= activeIndex ? 'bg-white shadow-[0_0_10px_white]' : 'bg-white/10'}`}
          />
        ))}
      </div>

      {/* Close Button */}
      <button 
        onClick={() => { triggerHaptic('impactLight'); onBack(); }}
        className="absolute top-6 right-6 z-50 p-3 bg-white/10 backdrop-blur-md rounded-full hover:bg-white/20 transition-all border border-white/10 group active:scale-95"
      >
        <svg className="w-6 h-6 text-white group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      {/* Scroll Container - Using 100dvh for better mobile support */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
      >
        {stories.map((story, idx) => (
          <section 
            key={story.id} 
            className={`h-[100dvh] w-full snap-start relative flex flex-col items-center justify-center p-8 text-center overflow-hidden ${story.bg}`}
          >
            {/* Animated Background Elements with Parallax */}
            <div 
                className={`absolute top-1/4 left-1/4 w-96 h-96 ${story.accent.replace('text-', 'bg-')}/10 rounded-full blur-[100px] animate-pulse transition-transform duration-100 ease-out`}
                style={{ transform: `translate(${mousePos.x * -1}px, ${mousePos.y * -1}px)` }}
            ></div>
            <div 
                className={`absolute bottom-1/4 right-1/4 w-64 h-64 bg-white/5 rounded-full blur-[80px] animate-bounce-slow transition-transform duration-100 ease-out`}
                style={{ transform: `translate(${mousePos.x}px, ${mousePos.y}px)` }}
            ></div>

            <div className={`relative z-10 transition-all duration-1000 transform ${activeIndex === idx ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-95'}`}>
              <div className="text-8xl mb-8 filter drop-shadow-2xl animate-bounce-slow">{story.icon}</div>
              <h2 className={`text-4xl md:text-7xl font-black mb-6 tracking-tighter ${story.accent}`}>
                {story.title}
              </h2>
              <p className="text-xl md:text-3xl font-bold leading-relaxed max-w-2xl mx-auto mb-6 text-slate-100">
                {story.text}
              </p>
              <p className="text-sm md:text-lg font-bold text-slate-400 uppercase tracking-[0.2em]">
                {story.sub}
              </p>

              {story.isLast && (
                <div className="mt-12">
                  <button 
                    onClick={() => { triggerHaptic('success'); onBack(); }}
                    className="px-10 py-5 bg-white text-slate-900 rounded-full font-black uppercase text-sm tracking-widest hover:scale-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] animate-pulse"
                  >
                    Get Started
                  </button>
                </div>
              )}
            </div>

            {/* Scroll Hint */}
            {!story.isLast && (
              <div 
                onClick={() => scrollRef.current?.scrollBy({ top: window.innerHeight, behavior: 'smooth' })}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce opacity-50 cursor-pointer p-4"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};

export default AppStory;
