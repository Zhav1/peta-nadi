export interface MapDockLayoutInput {
  isLeftSidebarCollapsed: boolean;
  isCrisisDrawerOpen: boolean;
}

const MAP_DOCK_CLASSES = {
  sidebarAndDrawer: 'lg:left-[calc((100vw-424px+320px)/2)] max-w-[calc(100vw-460px)] lg:max-w-[calc(100vw-424px-320px-48px)]',
  sidebarOnly: 'lg:left-[calc((100vw+320px)/2)] lg:max-w-[calc(100vw-320px-48px)]',
  drawerOnly: 'lg:left-[calc((100vw-424px)/2)] max-w-[calc(100vw-460px)]',
  mapOnly: 'lg:left-1/2',
} as const;

export function resolveMapDockClasses({
  isLeftSidebarCollapsed,
  isCrisisDrawerOpen,
}: MapDockLayoutInput): string {
  if (!isLeftSidebarCollapsed && isCrisisDrawerOpen) return MAP_DOCK_CLASSES.sidebarAndDrawer;
  if (!isLeftSidebarCollapsed) return MAP_DOCK_CLASSES.sidebarOnly;
  if (isCrisisDrawerOpen) return MAP_DOCK_CLASSES.drawerOnly;
  return MAP_DOCK_CLASSES.mapOnly;
}
