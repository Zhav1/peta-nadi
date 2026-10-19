export interface MapDockLayoutInput {
  isLeftSidebarCollapsed?: boolean;
  isCrisisDrawerOpen: boolean;
}

const MAP_DOCK_CLASSES = {
  drawerOpen: 'lg:left-[calc((100%-390px)/2)] max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100%-420px)]',
  drawerClosed: 'left-1/2 max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100%-2rem)]',
} as const;

export function resolveMapDockClasses({
  isCrisisDrawerOpen,
}: MapDockLayoutInput): string {
  if (isCrisisDrawerOpen) return MAP_DOCK_CLASSES.drawerOpen;
  return MAP_DOCK_CLASSES.drawerClosed;
}
