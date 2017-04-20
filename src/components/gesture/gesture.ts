import { Component, Listen, Ionic, Prop } from '../../index';
import { GestureController, GestureDelegate } from './gesture-controller';
import { GestureCallback, GestureDetail } from '../../util/interfaces';
import { pointerCoordX, pointerCoordY } from '../../util/dom'
import { PanRecognizer } from './recognizers';


@Component({
  tag: 'ion-gesture',
  shadow: false
})
export class Gesture {
  private detail: GestureDetail = {};
  private gesture: GestureDelegate;
  private lastTouch = 0;
  private pan: PanRecognizer;
  private hasCapturedPan = false;
  private hasPress = false;
  private hasStartedPan = false;
  private requiresMove = false;

  @Prop() direction: string = 'x';
  @Prop() gestureName: string = '';
  @Prop() gesturePriority: number = 0;
  @Prop() listenOn: string = 'child';
  @Prop() maxAngle: number = 40;
  @Prop() threshold: number = 20;
  @Prop() type: string = 'pan';

  @Prop() canStart: GestureCallback;
  @Prop() onStart: GestureCallback;
  @Prop() onMove: GestureCallback;
  @Prop() onEnd: GestureCallback;
  @Prop() onPress: GestureCallback;
  @Prop() notCaptured: GestureCallback;


  ionViewDidLoad() {
    Ionic.controllers.gesture = (Ionic.controllers.gesture || new GestureController());

    this.gesture = (<GestureController>Ionic.controllers.gesture).createGesture(this.gestureName, this.gesturePriority, false);

    const types = this.type.replace(/\s/g, '').toLowerCase().split(',');

    if (types.indexOf('pan') > -1) {
      this.pan = new PanRecognizer(this.direction, this.threshold, this.maxAngle);
      this.requiresMove = true;
    }
    this.hasPress = (types.indexOf('press') > -1);

    if (this.pan || this.hasPress) {
      Ionic.listener.enable(this, 'touchstart', true, this.listenOn);
      Ionic.listener.enable(this, 'mousedown', true, this.listenOn);
    }
  }


  // DOWN *************************

  @Listen('touchstart', { passive: true, enabled: false })
  onTouchStart(ev: TouchEvent) {
    this.lastTouch = this.detail.timeStamp = now(ev);

    this.enableMouse(false);
    this.enableTouch(true);

    this.pointerDown(ev);
  }


  @Listen('mousedown', { passive: true, enabled: false })
  onMouseDown(ev: MouseEvent) {
    const timeStamp = now(ev);

    if (this.lastTouch === 0 || (this.lastTouch + MOUSE_WAIT < timeStamp)) {
      this.detail.timeStamp = timeStamp;
      this.enableMouse(true);
      this.enableTouch(false);

      this.pointerDown(ev);
    }
  }


  private pointerDown(ev: UIEvent): boolean {
    if (!this.gesture || this.hasStartedPan) {
      return false;
    }

    const detail = this.detail;

    detail.startX = detail.currentX = pointerCoordX(ev);
    detail.startY = detail.currentY = pointerCoordY(ev);
    detail.event = ev;

    if (this.canStart && this.canStart(detail) === false) {
      return false;
    }

    // Release fallback
    this.gesture.release();

    // Start gesture
    if (!this.gesture.start()) {
      return false;
    }

    if (this.pan) {
      this.hasStartedPan = true;
      this.hasCapturedPan = false;

      this.pan.start(detail.startX, detail.startY);
    }

    return true;
  }


  // MOVE *************************

  @Listen('touchmove', { passive: true, enabled: false })
  onTouchMove(ev: TouchEvent) {
    this.lastTouch = this.detail.timeStamp = now(ev);

    this.pointerMove(ev);
  }


  @Listen('document:mousemove', { passive: true, enabled: false })
  onMoveMove(ev: TouchEvent) {
    const timeStamp = now(ev);

    if (this.lastTouch === 0 || (this.lastTouch + MOUSE_WAIT < timeStamp)) {
      this.detail.timeStamp = timeStamp;
      this.pointerMove(ev);
    }
  }

  private pointerMove(ev: UIEvent) {
    if (this.pan) {
      const detail = this.detail;
      detail.currentX = pointerCoordX(ev);
      detail.currentY = pointerCoordY(ev);
      detail.event = ev;

      if (this.hasCapturedPan) {
        // this.debouncer.write(() => {
          detail.type = 'pan';
          if (this.onMove) {
            this.onMove(detail);
          } else {
            Ionic.emit(this, 'ionGestureMove', this.detail);
          }
        // });

      } else if (this.pan.detect(detail.currentX, detail.currentY)) {
        if (this.pan.isGesture() !== 0) {
          if (!this.tryToCapturePan(ev)) {
            this.abortGesture();
          }
        }
      }
    }
  }

  private tryToCapturePan(ev: UIEvent): boolean {
    if (this.gesture && !this.gesture.capture()) {
      return false;
    }

    this.detail.event = ev;

    if (this.onStart) {
      this.onStart(this.detail);
    } else {
      Ionic.emit(this, 'ionGestureStart', this.detail);
    }

    this.hasCapturedPan = true;

    return true;
  }

  private abortGesture() {
    this.hasStartedPan = false;
    this.hasCapturedPan = false;

    this.gesture.release();

    this.enable(false)
    this.notCaptured(this.detail);
  }


  // END *************************

  @Listen('touchend', { passive: true, enabled: false })
  onTouchEnd(ev: TouchEvent) {
    this.lastTouch = this.detail.timeStamp = now(ev);

    this.pointerUp(ev);
    this.enableTouch(false);
  }


  @Listen('document:mouseup', { passive: true, enabled: false })
  onMouseUp(ev: TouchEvent) {
    const timeStamp = now(ev);

    if (this.lastTouch === 0 || (this.lastTouch + MOUSE_WAIT < timeStamp)) {
      this.detail.timeStamp = timeStamp;
      this.pointerUp(ev);
      this.enableMouse(false);
    }
  }


  private pointerUp(ev: UIEvent) {
    const detail = this.detail;
    // this.debouncer.cancel();

    this.gesture && this.gesture.release();

    detail.event = ev;

    if (this.pan) {
      if (this.hasCapturedPan) {
        detail.type = 'pan';
        if (this.onEnd) {
          this.onEnd(detail);
        } else {
          Ionic.emit(this, 'ionGestureEnd', detail);
        }

      } else if (this.hasPress) {
        this.detectPress();

      } else {
        if (this.notCaptured) {
          this.notCaptured(detail);
        } else {
          Ionic.emit(this, 'ionGestureNotCaptured', detail);
        }
      }

    } else if (this.hasPress) {
      this.detectPress();
    }

    this.hasCapturedPan = false;
    this.hasStartedPan = false;
  }


  private detectPress() {
    const detail = this.detail;

    if (Math.abs(detail.startX - detail.currentX) < 10 && Math.abs(detail.startY - detail.currentY) < 10) {
      detail.type = 'press';

      if (this.onPress) {
        this.onPress(detail);
      } else {
        Ionic.emit(this, 'ionPress', detail);
      }
    }
  }


  // ENABLE LISTENERS *************************

  private enableMouse(shouldEnable: boolean) {
    if (this.requiresMove) {
      Ionic.listener.enable(this, 'document:mousemove', shouldEnable);
    }
    Ionic.listener.enable(this, 'document:mouseup', shouldEnable);
  }


  private enableTouch(shouldEnable: boolean) {
    if (this.requiresMove) {
      Ionic.listener.enable(this, 'touchmove', shouldEnable);
    }
    Ionic.listener.enable(this, 'touchend', shouldEnable);
  }


  private enable(shouldEnable: boolean) {
    this.enableMouse(shouldEnable);
    this.enableTouch(shouldEnable);
  }


  ionViewWillUnload() {
    this.gesture && this.gesture.destroy();
    this.gesture = this.pan = this.detail = this.detail.event = null;
  }

}


const MOUSE_WAIT = 2500;

function now(ev: UIEvent) {
  return ev.timeStamp || Date.now();
}