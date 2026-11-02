import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "@toy-store/shared";

export type AuthModalMode = "login" | "register" | "forgot";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** 是否已完成首次登录态恢复（用本地 token 换回 user）。在此之前不能断定用户未登录 */
  initialized: boolean;
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  initialized: false,
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
    /** 首次登录态恢复结束（无论成功还是失败），之后才允许按 isAuthenticated 做跳转 */
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.initialized = action.payload;
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

export const { setUser, setAuthModalOpen, setAuthModalMode, setInitialized, logout } =
  authSlice.actions;
export default authSlice.reducer;
