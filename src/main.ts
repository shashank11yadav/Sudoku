import './styles.css';
import { Announcer, byId } from './ui/dom';
import { PlayController } from './ui/play';
import { initTabs } from './ui/tabs';
import { initTheme } from './ui/theme';
import { Visualizer } from './ui/visualizer';
import { EngineClient } from './worker/client';

initTheme();

const announcer = new Announcer(byId('announcer'), byId('alert'));
const play = new PlayController(new EngineClient(), announcer);
const visualizer = new Visualizer(() => play.currentPuzzle());

initTabs(byId('tab-play').parentElement ?? document.body, (panelId) => {
  const watching = panelId === 'panel-watch';
  play.setActive(!watching);
  if (watching) visualizer.activate();
  else visualizer.pause();
});

void play.start();
