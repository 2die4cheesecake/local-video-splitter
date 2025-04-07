FROM golang:1.24 AS builder
WORKDIR /app
COPY go.mod go.sum ./
COPY main.go ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
COPY public/ ./public/
EXPOSE 8080
CMD [ "./main" ]