#!/usr/bin/env python3
from fcntl import LOCK_EX, lockf
from os import environ, execvp
from sys import argv

fd = open(argv[1], "wb")
lockf(fd, LOCK_EX)

execvp(argv[2], argv[2:])
