// JALANGI DO NOT INSTRUMENT
import { DOMClobberingVerifier } from "../../gadget-detection/runtime-analysis/src/others/dom-clobbering-verifier.js";

if (J$$) {
  J$$.analysis = new DOMClobberingVerifier(J$$);
} else {
  throw "[TheHulk] Analysis module cannot be installed. J$$ not found.";
}
