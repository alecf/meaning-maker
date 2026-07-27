"use client";
import { ChakraBaseProvider, extendBaseTheme } from "@chakra-ui/react";
import { theme as baseTheme } from "@chakra-ui/theme";
import { type StyleFunctionProps, mode } from "@chakra-ui/theme-tools";
import type { FC, PropsWithChildren } from "react";

const {
  Button,
  Card,
  Container,
  Divider,
  Editable,
  Form,
  FormError,
  FormLabel,
  Heading,
  Input,
  NumberInput,
  Spinner,
  Textarea,
  Tooltip,
  Stepper,
} = baseTheme.components;

const theme = extendBaseTheme({
  config: {
    initialColorMode: "system",
    useSystemColorMode: true,
  },
  styles: {
    global: (props: Record<string, unknown> | StyleFunctionProps) => ({
      body: {
        bg: mode("gray.100", "gray.800")(props),
      },
    }),
  },
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
    Input,
    Heading,
    Editable,
    Spinner,
    Stepper,
  },
});

export const Providers: FC<PropsWithChildren> = ({ children }) => {
  return <ChakraBaseProvider theme={theme}>{children}</ChakraBaseProvider>;
};
