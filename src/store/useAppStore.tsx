import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  DailyLog,
  ExerciseLog,
  MealLog,
  MoodScore,
  PeriodRecord,
  Symptom,
  UserProfile,
} from "../core";
import { compareIso } from "../core";
import {
  clearState,
  emptyState,
  loadState,
  saveState,
  seedState,
  type AppState,
} from "./state";

// ---------------------------------------------------------------------------
// Store de la app con useReducer + Context. Persiste en cada cambio.
// ---------------------------------------------------------------------------

type Action =
  | { type: "SET_PROFILE"; profile: Partial<UserProfile> }
  | { type: "ADD_PERIOD"; period: PeriodRecord }
  | { type: "REMOVE_PERIOD"; inicio: string }
  | { type: "UPSERT_DAILY_LOG"; log: DailyLog }
  | { type: "UPSERT_MOOD"; fecha: string; animo: MoodScore }
  | { type: "TOGGLE_SYMPTOM"; fecha: string; sintoma: Symptom }
  | { type: "ADD_EXERCISE_LOG"; log: ExerciseLog }
  | { type: "TOGGLE_EXERCISE_DONE"; fecha: string }
  | { type: "ADD_MEAL"; meal: MealLog }
  | { type: "RESET_DEMO" }
  | { type: "RESET_EMPTY" };

function upsertLog(logs: DailyLog[], fecha: string): [DailyLog, DailyLog[]] {
  const existing = logs.find((l) => l.fecha === fecha);
  const log: DailyLog = existing ?? { fecha, sintomas: [] };
  const rest = logs.filter((l) => l.fecha !== fecha);
  return [{ ...log, sintomas: [...log.sintomas] }, rest];
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_PROFILE":
      return { ...state, profile: { ...state.profile, ...action.profile } };

    case "ADD_PERIOD": {
      const periods = [
        ...state.periods.filter((p) => p.inicio !== action.period.inicio),
        action.period,
      ].sort((a, b) => compareIso(a.inicio, b.inicio));
      return { ...state, periods };
    }

    case "REMOVE_PERIOD":
      return {
        ...state,
        periods: state.periods.filter((p) => p.inicio !== action.inicio),
      };

    case "UPSERT_DAILY_LOG": {
      const rest = state.dailyLogs.filter((l) => l.fecha !== action.log.fecha);
      return { ...state, dailyLogs: [...rest, action.log] };
    }

    case "UPSERT_MOOD": {
      const [log, rest] = upsertLog(state.dailyLogs, action.fecha);
      return { ...state, dailyLogs: [...rest, { ...log, animo: action.animo }] };
    }

    case "TOGGLE_SYMPTOM": {
      const [log, rest] = upsertLog(state.dailyLogs, action.fecha);
      const has = log.sintomas.includes(action.sintoma);
      const sintomas = has
        ? log.sintomas.filter((s) => s !== action.sintoma)
        : [...log.sintomas, action.sintoma];
      return { ...state, dailyLogs: [...rest, { ...log, sintomas }] };
    }

    case "ADD_EXERCISE_LOG": {
      const rest = state.exerciseLogs.filter((l) => l.fecha !== action.log.fecha);
      return { ...state, exerciseLogs: [...rest, action.log] };
    }

    case "TOGGLE_EXERCISE_DONE": {
      const existing = state.exerciseLogs.find((l) => l.fecha === action.fecha);
      if (!existing) return state;
      const exerciseLogs = state.exerciseLogs.map((l) =>
        l.fecha === action.fecha ? { ...l, completado: !l.completado } : l,
      );
      return { ...state, exerciseLogs };
    }

    case "ADD_MEAL":
      return { ...state, mealLogs: [...state.mealLogs, action.meal] };

    case "RESET_DEMO":
      return seedState();

    case "RESET_EMPTY":
      return emptyState();

    default:
      return state;
  }
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useAppStore debe usarse dentro de <StoreProvider>");
  return ctx;
}

export { clearState };
