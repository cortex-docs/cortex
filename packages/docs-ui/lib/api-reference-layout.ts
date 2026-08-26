export const MIN_API_REFERENCE_CENTER_WIDTH = 280;

const RESIZE_HANDLE_LAYOUT_WIDTH = 4;

interface ApiReferenceLayoutWidths {
  layoutWidth: number;
  leftSidebarWidth: number;
  rightSidebarWidth: number;
}

export interface ApiReferencePanelVisibility {
  centerWidthWithRightSidebar: number;
  showLeftSidebarInline: boolean;
  showRightSidebar: boolean;
}

export function getApiReferencePanelVisibility({
  layoutWidth,
  leftSidebarWidth,
  rightSidebarWidth,
}: ApiReferenceLayoutWidths): ApiReferencePanelVisibility {
  const centerWidthWithLeftSidebar = layoutWidth - leftSidebarWidth - RESIZE_HANDLE_LAYOUT_WIDTH;
  const showLeftSidebarInline = centerWidthWithLeftSidebar > MIN_API_REFERENCE_CENTER_WIDTH;
  const centerWidthWithRightSidebar =
    layoutWidth -
    (showLeftSidebarInline ? leftSidebarWidth + RESIZE_HANDLE_LAYOUT_WIDTH : 0) -
    rightSidebarWidth -
    RESIZE_HANDLE_LAYOUT_WIDTH;

  return {
    centerWidthWithRightSidebar,
    showLeftSidebarInline,
    showRightSidebar: centerWidthWithRightSidebar > MIN_API_REFERENCE_CENTER_WIDTH,
  };
}
