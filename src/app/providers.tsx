"use client";
import { ChakraBaseProvider, extendBaseTheme } from "@chakra-ui/react";
import chakraTheme from "@chakra-ui/theme";
import { FC, PropsWithChildren } from "react";

const {
  Button,
  Textarea,
  Container,
  Card,
  Divider,
  Form,
  FormError,
  FormLabel,
  NumberInput,
  Tooltip,
} = chakraTheme.components;

const theme = extendBaseTheme({
  components: {
    Button,
    Textarea,
    Container,
    Card,
    Divider,
    Form,
    FormError,
    FormLabel,
    NumberInput,
    Tooltip,
  },
});

export const Providers: FC<PropsWithChildren> = ({ children }) => {
  return <ChakraBaseProvider theme={theme}>{children}</ChakraBaseProvider>;
};
