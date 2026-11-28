import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { installAuthenticatedApiFetch } from './firebase/apiFetch';
import './index.css';

installAuthenticatedApiFetch();

createRoot(document.getElementById('root')!).render(<App />);
