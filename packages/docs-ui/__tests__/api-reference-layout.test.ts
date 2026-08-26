import { describe, expect, it } from 'vitest';
import { getApiReferencePanelVisibility } from '../lib/api-reference-layout';

const widths = {
  leftSidebarWidth: 224,
  rightSidebarWidth: 420,
};

describe('API reference responsive layout', () => {
  it('hides the right sidebar when the desktop center panel is exactly 280px wide', () => {
    const visibility = getApiReferencePanelVisibility({ ...widths, layoutWidth: 932 });

    expect(visibility).toEqual({
      centerWidthWithRightSidebar: 280,
      showLeftSidebarInline: true,
      showRightSidebar: false,
    });
  });

  it('keeps the right sidebar when the desktop center panel is 281px wide', () => {
    expect(getApiReferencePanelVisibility({ ...widths, layoutWidth: 933 })).toEqual({
      centerWidthWithRightSidebar: 281,
      showLeftSidebarInline: true,
      showRightSidebar: true,
    });
  });

  it('keeps the left sidebar inline after the right sidebar moves to the bottom', () => {
    const visibility = getApiReferencePanelVisibility({ ...widths, layoutWidth: 700 });

    expect(visibility.showLeftSidebarInline).toBe(true);
    expect(visibility.showRightSidebar).toBe(false);
  });

  it('only moves the left sidebar off canvas when its center panel reaches 280px', () => {
    expect(
      getApiReferencePanelVisibility({ ...widths, layoutWidth: 508 }).showLeftSidebarInline,
    ).toBe(false);
    expect(
      getApiReferencePanelVisibility({ ...widths, layoutWidth: 509 }).showLeftSidebarInline,
    ).toBe(true);
  });
});
