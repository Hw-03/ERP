"use client";

import { createContext } from "react";

/** Portaled workspace popups must yield to authentication without losing their drafts. */
export const WorkspaceInteractionContext = createContext(true);
