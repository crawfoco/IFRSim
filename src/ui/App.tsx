import { APP_NAME, TRAINING_DISCLAIMER } from '../app-info';

export function App() {
  return (
    <main className="app">
      <h1>{APP_NAME}</h1>
      <p className="disclaimer">{TRAINING_DISCLAIMER}</p>
      <p>IFR approach trainer: under construction.</p>
    </main>
  );
}
