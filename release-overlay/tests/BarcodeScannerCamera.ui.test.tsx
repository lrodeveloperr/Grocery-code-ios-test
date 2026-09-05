import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import BarcodeScannerCamera from "../src/BarcodeScannerCamera";

let mockPermission: null | { granted: boolean; canAskAgain: boolean } = null;
const mockRequestPermission = jest.fn();

jest.mock("expo-camera", () => {
  const ReactModule = require("react");
  const { View } = require("react-native");
  return {
    CameraView: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { ...props, testID: "camera-view" }),
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});

const baseProps = () => ({
  barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] as const,
  onBarcodeScanned: jest.fn(),
  onMountError: jest.fn(),
  onPermissionDenied: jest.fn(),
  onPermissionError: jest.fn(),
  preparingText: "Preparing camera…",
});

beforeEach(() => {
  mockPermission = null;
  mockRequestPermission.mockReset();
});

test("renders a safe loading state before camera permission resolves", async () => {
  const props = baseProps();
  const screen = await render(<BarcodeScannerCamera {...props} barcodeTypes={[...props.barcodeTypes]} />);
  expect(screen.getByText("Preparing camera…")).toBeTruthy();
  expect(screen.queryByTestId("camera-view")).toBeNull();
});

test("renders the rear camera and forwards a scanned barcode when authorized", async () => {
  mockPermission = { granted: true, canAskAgain: true };
  const props = baseProps();
  const screen = await render(<BarcodeScannerCamera {...props} barcodeTypes={[...props.barcodeTypes]} />);
  const camera = screen.getByTestId("camera-view");
  const scan = { data: "036000291452", type: "upc_a" };
  fireEvent(camera, "barcodeScanned", scan);
  expect(props.onBarcodeScanned).toHaveBeenCalledWith(scan);
  expect(camera.props.facing).toBe("back");
});

test("reports a permanent permission denial exactly once", async () => {
  mockPermission = { granted: false, canAskAgain: false };
  const props = baseProps();
  await render(<BarcodeScannerCamera {...props} barcodeTypes={[...props.barcodeTypes]} />);
  await waitFor(() => expect(props.onPermissionDenied).toHaveBeenCalledTimes(1));
  expect(mockRequestPermission).not.toHaveBeenCalled();
});

test("requests permission once and reports a rejected request", async () => {
  mockPermission = { granted: false, canAskAgain: true };
  mockRequestPermission.mockResolvedValue({ granted: false, canAskAgain: true });
  const props = baseProps();
  await render(<BarcodeScannerCamera {...props} barcodeTypes={[...props.barcodeTypes]} />);
  await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(props.onPermissionDenied).toHaveBeenCalledTimes(1));
});

test("reports permission API failures without mounting the camera", async () => {
  mockPermission = { granted: false, canAskAgain: true };
  const failure = new Error("permission unavailable");
  mockRequestPermission.mockRejectedValue(failure);
  const props = baseProps();
  const screen = await render(<BarcodeScannerCamera {...props} barcodeTypes={[...props.barcodeTypes]} />);
  await waitFor(() => expect(props.onPermissionError).toHaveBeenCalledWith(failure));
  expect(screen.queryByTestId("camera-view")).toBeNull();
});
