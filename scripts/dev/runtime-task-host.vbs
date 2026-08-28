Option Explicit

Dim arguments, command, exitCode, shell
Set arguments = WScript.Arguments

If arguments.Count <> 2 Then
    WScript.Quit 64
End If

Function QuoteArgument(value)
    QuoteArgument = Chr(34) & Replace(CStr(value), Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function

command = QuoteArgument(arguments(0)) & _
    " -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & _
    QuoteArgument(arguments(1)) & " -RuntimeTaskHost"

Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
