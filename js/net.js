// Online rooms. Loads the shared module; nothing touches the network until a room is made or joined.
import { createOnline } from './online.js?v=1';

window.RiskNet = createOnline({ game: window.RiskGame.game, gameId: 'risk', botDelayMs: 700 });
window.dispatchEvent(new Event('risknet'));
