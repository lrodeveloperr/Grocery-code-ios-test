import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from "expo-camera";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type Props = {
  barcodeTypes: BarcodeType[];
  onBarcodeScanned: (result: BarcodeScanningResult) => void;
  onMountError: (error: { message: string }) => void;
  onPermissionDenied: () => void;
  onPermissionError: (error: unknown) => void;
  preparingText: string;
};

export default function BarcodeScannerCamera({
  barcodeTypes,
  onBarcodeScanned,
  onMountError,
  onPermissionDenied,
  onPermissionError,
  preparingText,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const permissionRequestStarted = useRef(false);

  useEffect(() => {
    if (!permission || permission.granted || permissionRequestStarted.current) {
      return;
    }
    permissionRequestStarted.current = true;
    void requestPermission()
      .then((result) => {
        if (!result.granted) onPermissionDenied();
      })
      .catch(onPermissionError);
  }, [
    onPermissionDenied,
    onPermissionError,
    permission,
    requestPermission,
  ]);

  if (!permission?.granted) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#ffffff" size="large" />
        <Text style={styles.loadingText}>{preparingText}</Text>
      </View>
    );
  }

  return (
    <CameraView
      accessible={false}
      barcodeScannerSettings={{ barcodeTypes }}
      facing="back"
      onBarcodeScanned={onBarcodeScanned}
      onMountError={onMountError}
      style={styles.camera}
    />
  );
}

const styles = StyleSheet.create({
  camera: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  loading: {
    alignItems: "center",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "#0b0b0c",
    justifyContent: "center",
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 14,
  },
});
