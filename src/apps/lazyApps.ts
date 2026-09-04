import { lazy } from "react";

/**
 * Every app is code-split so opening NovaOS doesn't download all of them.
 *
 * These live in their own module because the registry also exports plain data
 * (`APPS`, `getApp`), and mixing component and non-component exports in one file
 * breaks React Fast Refresh.
 */

export const FileExplorer = lazy(() => import("./FileExplorer"));
export const Calculator = lazy(() => import("./Calculator"));
export const Notes = lazy(() => import("./Notes"));
export const Notepad = lazy(() => import("./Notepad"));
export const Photos = lazy(() => import("./Photos"));
export const Paint = lazy(() => import("./Paint"));
export const Music = lazy(() => import("./Music"));
export const Settings = lazy(() => import("./Settings"));
export const Browser = lazy(() => import("./Browser"));
export const NovaTube = lazy(() => import("./NovaTube"));
export const NovaFlix = lazy(() => import("./NovaFlix"));
export const NovaMusic = lazy(() => import("./NovaMusic"));
export const Calendar = lazy(() => import("./Calendar"));
export const Terminal = lazy(() => import("./Terminal"));
export const CodeStudio = lazy(() => import("./CodeStudio"));
export const AppStore = lazy(() => import("./AppStore"));
export const BlakApp = lazy(() => import("./BlakApp"));
export const TaskManager = lazy(() => import("./TaskManager"));
export const MediaPlayer = lazy(() => import("./MediaPlayer"));
export const PdfViewer = lazy(() => import("./PdfViewer"));
