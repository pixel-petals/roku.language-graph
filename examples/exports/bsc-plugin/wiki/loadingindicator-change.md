# loadingindicator-change

## Overview

Directory-based community: components/LoadingIndicator

- **Size**: 19 nodes
- **Cohesion**: 0.0000
- **Dominant Language**: brightscript

## Members

| Name | Kind | File | Lines |
|------|------|------|-------|
| init | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 3-22 |
| updateLayout | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 24-69 |
| changeRotationDirection | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 72-79 |
| omImageLoadStatusChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 82-97 |
| onImageWidthChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 100-109 |
| onImageHeightChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 112-121 |
| onTextChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 124-135 |
| onBackgroundImageChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 138-150 |
| onBackgroundOpacityChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 153-158 |
| onTextPaddingChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 161-169 |
| onControlChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 172-188 |
| onFadeAnimationStateChange | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 191-196 |
| getComponentWidth | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 199-207 |
| getComponentHeight | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 210-218 |
| getParentWidth | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 221-228 |
| getParentHeight | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 231-238 |
| startAnimation | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 241-254 |
| stopAnimation | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 257-261 |
| max | Function | /home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs | 264-271 |

## Execution Flows

No execution flows pass through this community.

## Dependencies

### Outgoing

- `m.top.getParent` (9 edge(s))
- `m.top.findNode` (9 edge(s))
- `updateLayout` (4 edge(s))
- `getParentHeight` (2 edge(s))
- `getParentWidth` (2 edge(s))
- `startAnimation` (2 edge(s))
- `stopAnimation` (2 edge(s))
- `observeField` (2 edge(s))
- `max` (2 edge(s))
- `m.image.observeField` (1 edge(s))
- `omImageLoadStatusChange` (1 edge(s))
- `m.fadeAnimation.observeField` (1 edge(s))
- `m.text.localBoundingRect` (1 edge(s))
- `updatelayout` (1 edge(s))
- `getModel` (1 edge(s))

### Incoming

- `/home/user/roku-graphify/demo/roku-app/components/LoadingIndicator/LoadingIndicator.brs` (19 edge(s))
