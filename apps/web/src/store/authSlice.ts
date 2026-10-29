import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "@toy-store/shared";

export type AuthModalMode = "login" | "register" | "forgot";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  authModalOpen: false,
  authModalMode: "login",
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setAuthModalOpen: (state, action: PayloadAction<boolean>) => {
      state.authModalOpen = action.payload;
    },
    setAuthModalMode: (state, action: PayloadAction<AuthModalMode>) => {
      state.authModalMode = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setUser, setAuthModalOpen, setAuthModalMode, logout } = authSlice.actions;
export default authSlice.reducer;
